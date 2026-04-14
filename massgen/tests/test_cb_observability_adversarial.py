"""Adversarial tests for circuit breaker observability module.

Attacker mindset: corrupted inputs, concurrent races, import failure injection.

Categories covered (per jarvis-team-cleanup.md):
  1. Corrupted input / boundary abuse
  2. Concurrent access / race conditions
  3. Resource exhaustion / failure injection
"""

from __future__ import annotations

import asyncio
import sys
import threading
from types import ModuleType
from unittest.mock import patch

import pytest

from massgen.backend.llm_circuit_breaker import (
    CircuitState,
    LLMCircuitBreaker,
    LLMCircuitBreakerConfig,
)
from massgen.observability import CircuitBreakerMetrics

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_fake_prometheus_with_counters() -> tuple[ModuleType, dict]:
    """Build fake prometheus_client that tracks all calls in a thread-safe dict."""
    import threading as _threading

    lock = _threading.Lock()
    calls: dict = {"transitions": [], "requests": [], "observations": [], "gauge_sets": []}

    class _LS:
        def __init__(self, name: str, labels: dict) -> None:
            self._name = name
            self._labels = labels

        def inc(self) -> None:
            with lock:
                if self._name == "cb_state_transitions_total":
                    calls["transitions"].append(dict(self._labels))
                elif self._name == "cb_requests_total":
                    calls["requests"].append(dict(self._labels))

        def observe(self, v: float) -> None:
            with lock:
                calls["observations"].append(v)

        def set(self, v: float) -> None:
            with lock:
                calls["gauge_sets"].append(v)

    class _M:
        def __init__(self, name: str, *a, **kw) -> None:
            self._name = name

        def labels(self, **kw):
            return _LS(self._name, kw)

    class _R:
        pass

    mod = ModuleType("prometheus_client")
    mod.CollectorRegistry = _R
    mod.Counter = lambda name, *a, **kw: _M(name)
    mod.Histogram = lambda name, *a, **kw: _M(name)
    mod.Gauge = lambda name, *a, **kw: _M(name)

    sys.modules["prometheus_client"] = mod
    return mod, calls


def _remove_fake() -> None:
    sys.modules.pop("prometheus_client", None)


# ---------------------------------------------------------------------------
# Category 1: Corrupted input / boundary abuse
# ---------------------------------------------------------------------------


class TestAdversarialCorruptedInput:
    """Corrupted inputs must not crash CircuitBreakerMetrics."""

    def setup_method(self) -> None:
        _remove_fake()
        _, self._calls = _build_fake_prometheus_with_counters()
        self._m = CircuitBreakerMetrics()

    def teardown_method(self) -> None:
        _remove_fake()

    def test_none_backend_name(self) -> None:
        """None backend label must not crash, increments counter, and records None label."""
        initial = len(self._calls["transitions"])
        self._m.record_state_transition(None, "closed", "open")  # type: ignore[arg-type]
        assert len(self._calls["transitions"]) == initial + 1
        assert self._calls["transitions"][-1]["backend"] is None

    def test_empty_string_backend_name(self) -> None:
        """Empty-string backend must not crash and records correctly."""
        self._m.record_state_transition("", "closed", "open")
        self._m.record_request("", "success", 0.1)
        assert any(t["backend"] == "" for t in self._calls["transitions"])
        assert any(r["backend"] == "" for r in self._calls["requests"])

    def test_negative_latency(self) -> None:
        """Negative latency from clock skew must not crash; observation is recorded."""
        initial = len(self._calls["observations"])
        self._m.record_request("claude", "success", -0.001)
        assert len(self._calls["observations"]) == initial + 1
        assert self._calls["observations"][-1] == pytest.approx(-0.001)

    def test_zero_latency(self) -> None:
        """Zero latency is a valid boundary -- must be recorded as 0.0."""
        self._m.record_request("claude", "success", 0.0)
        assert 0.0 in self._calls["observations"]

    def test_latency_far_above_max_bucket(self) -> None:
        """Latency > 600s overflows into +Inf bucket -- must be recorded."""
        initial = len(self._calls["observations"])
        self._m.record_request("claude", "failure", 999.0)
        assert len(self._calls["observations"]) == initial + 1
        assert self._calls["observations"][-1] == pytest.approx(999.0)

    def test_same_state_transition(self) -> None:
        """from_state == to_state is valid; counter increments once."""
        initial = len(self._calls["transitions"])
        self._m.record_state_transition("claude", "open", "open")
        assert len(self._calls["transitions"]) == initial + 1
        assert self._calls["transitions"][-1] == {
            "backend": "claude",
            "from_state": "open",
            "to_state": "open",
        }

    def test_unknown_outcome_label(self) -> None:
        """Unknown outcome string must not crash and is recorded as-is."""
        outcome = "totally_unknown_outcome_xyz"
        self._m.record_request("claude", outcome, 0.5)
        assert any(r["outcome"] == outcome for r in self._calls["requests"])

    def test_unknown_state_string_gives_minus_one(self) -> None:
        """Unknown state string -> _state_value returns -1 (documented fallback)."""
        assert self._m._state_value("UNKNOWN_STATE") == -1

    def test_very_long_backend_name(self) -> None:
        """Very long backend name (potential cardinality) must not crash and is recorded."""
        long_name = "x" * 10_000
        self._m.record_state_transition(long_name, "closed", "open")
        self._m.record_request(long_name, "success", 0.1)
        assert any(t["backend"] == long_name for t in self._calls["transitions"])
        assert any(r["backend"] == long_name for r in self._calls["requests"])

    def test_unicode_backend_name(self) -> None:
        """Unicode backend name must not crash and is recorded."""
        name = "backend-\u30af\u30ed\u30fc\u30c9"
        self._m.record_state_transition(name, "closed", "open")
        assert any(t["backend"] == name for t in self._calls["transitions"])


# ---------------------------------------------------------------------------
# Category 2: Concurrent access / race conditions
# ---------------------------------------------------------------------------


class TestAdversarialConcurrentAccess:
    """100-thread concurrent access must produce consistent counter state."""

    def setup_method(self) -> None:
        _remove_fake()
        _, self._calls = _build_fake_prometheus_with_counters()
        self._m = CircuitBreakerMetrics()

    def teardown_method(self) -> None:
        _remove_fake()

    def test_concurrent_state_transitions_no_lost_updates(self) -> None:
        """100 threads emit state transitions; no updates must be lost."""
        N = 100
        errors: list[Exception] = []

        def worker(i: int) -> None:
            try:
                self._m.record_state_transition("claude", "closed", "open")
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(N)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == [], f"Exceptions in threads: {errors}"
        assert len(self._calls["transitions"]) == N, f"Expected {N} transitions, got {len(self._calls['transitions'])}"

    def test_concurrent_record_requests_no_lost_updates(self) -> None:
        """100 threads record requests; no updates must be lost."""
        N = 100
        errors: list[Exception] = []

        def worker(i: int) -> None:
            try:
                self._m.record_request("gemini", "success", float(i) * 0.01)
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(N)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == [], f"Exceptions in threads: {errors}"
        assert len(self._calls["requests"]) == N
        assert len(self._calls["observations"]) == N

    def test_concurrent_mixed_operations(self) -> None:
        """Mixed state_transition + record_request from 50+50 threads -- no crash."""
        N = 50
        errors: list[Exception] = []

        def transition_worker() -> None:
            try:
                self._m.record_state_transition("claude", "open", "half_open")
            except Exception as exc:
                errors.append(exc)

        def request_worker() -> None:
            try:
                self._m.record_request("claude", "failure", 0.5)
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=transition_worker) for _ in range(N)] + [threading.Thread(target=request_worker) for _ in range(N)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == [], f"Exceptions: {errors}"
        assert len(self._calls["transitions"]) == N
        assert len(self._calls["requests"]) == N

    def test_lazy_init_under_concurrent_first_call(self) -> None:
        """Concurrent first-call race on _ensure_metrics must not double-init."""
        # Track how many times CollectorRegistry is constructed
        init_count = 0
        orig_registry = sys.modules["prometheus_client"].CollectorRegistry

        class CountedRegistry:
            def __init__(self_inner) -> None:
                nonlocal init_count
                init_count += 1

        sys.modules["prometheus_client"].CollectorRegistry = CountedRegistry

        try:
            m = CircuitBreakerMetrics()
            assert m._available is None

            errors: list[Exception] = []

            def worker() -> None:
                try:
                    m.record_state_transition("x", "closed", "open")
                except Exception as exc:
                    errors.append(exc)

            threads = [threading.Thread(target=worker) for _ in range(20)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()

            assert errors == []
            assert m._available is True
            # Registry must be constructed exactly once (no double-init race)
            assert init_count == 1, f"Expected 1 registry init, got {init_count}"
        finally:
            sys.modules["prometheus_client"].CollectorRegistry = orig_registry


# ---------------------------------------------------------------------------
# Category 3: Resource exhaustion / import failure injection
# ---------------------------------------------------------------------------


class TestAdversarialFailureInjection:
    """Import failures and duplicate registration must be handled gracefully."""

    def setup_method(self) -> None:
        _remove_fake()

    def teardown_method(self) -> None:
        _remove_fake()

    def test_prometheus_client_raises_at_import_time(self) -> None:
        """prometheus_client raises ImportError: graceful no-op fallback."""

        def mock_import(name, *args, **kwargs):
            if name == "prometheus_client":
                raise ImportError("prometheus_client not installed")
            return __import__(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=mock_import):
            m = CircuitBreakerMetrics()
            m.record_state_transition("claude", "closed", "open")
            m.record_request("claude", "success", 0.5)
            assert m.get_registry() is None
            assert m._available is False

    def test_prometheus_unexpected_exception_at_import_propagates(self) -> None:
        """Non-ImportError at import (e.g. OSError) must propagate, not be swallowed."""

        def mock_import(name, *args, **kwargs):
            if name == "prometheus_client":
                raise OSError("disk I/O error loading prometheus_client")
            return __import__(name, *args, **kwargs)

        m = CircuitBreakerMetrics()
        with patch("builtins.__import__", side_effect=mock_import):
            with pytest.raises(OSError, match="disk I/O error"):
                m.get_registry()

    def test_duplicate_instance_no_metric_collision(self) -> None:
        """Two CircuitBreakerMetrics instances use separate registries -- no collision."""
        _build_fake_prometheus_with_counters()

        m1 = CircuitBreakerMetrics()
        m2 = CircuitBreakerMetrics()

        # Both must initialize without raising ValueError (duplicate metric)
        m1.record_state_transition("claude", "closed", "open")
        m2.record_state_transition("gemini", "closed", "open")

        # Registries must be distinct objects
        r1 = m1.get_registry()
        r2 = m2.get_registry()
        assert r1 is not None
        assert r2 is not None
        assert r1 is not r2

    def test_multiple_calls_after_unavailable_cached(self) -> None:
        """After _available=False cached, subsequent calls never attempt re-import."""
        import_attempt_count = 0

        def mock_import(name, *args, **kwargs):
            nonlocal import_attempt_count
            if name == "prometheus_client":
                import_attempt_count += 1
                raise ImportError("mocked")
            return __import__(name, *args, **kwargs)

        m = CircuitBreakerMetrics()

        with patch("builtins.__import__", side_effect=mock_import):
            for _ in range(10):
                m.record_state_transition("x", "closed", "open")

        # Import attempted exactly once (cached after first failure)
        assert import_attempt_count == 1

    def test_record_request_after_forced_available_false(self) -> None:
        """Manually setting _available=False makes all methods no-op immediately."""
        _, calls = _build_fake_prometheus_with_counters()
        m = CircuitBreakerMetrics()
        # Trigger initialization (sets _available=True with fake)
        m.record_state_transition("x", "closed", "open")
        assert m._available is True
        assert len(calls["transitions"]) == 1  # one recorded call so far

        # Force unavailable (simulate sudden library removal -- edge case)
        m._available = False
        before_transitions = len(calls["transitions"])
        before_requests = len(calls["requests"])

        # All methods must be no-ops -- call lists must NOT grow
        m.record_state_transition("x", "open", "closed")
        m.record_request("x", "success", 0.1)
        assert m.get_registry() is None

        assert len(calls["transitions"]) == before_transitions, "transitions grew despite _available=False"
        assert len(calls["requests"]) == before_requests, "requests grew despite _available=False"


# ---------------------------------------------------------------------------
# Category 4: HALF_OPEN edge cases -- rejected_half_open + abnormal reopen
# ---------------------------------------------------------------------------


class TestAdversarialHalfOpenEdgeCases:
    """HALF_OPEN rejection label and abnormal probe termination."""

    def setup_method(self) -> None:
        _remove_fake()
        _, self._calls = _build_fake_prometheus_with_counters()

    def teardown_method(self) -> None:
        _remove_fake()

    def _make_cb(self, max_failures: int = 1) -> LLMCircuitBreaker:
        metrics = CircuitBreakerMetrics()
        config = LLMCircuitBreakerConfig(
            enabled=True,
            max_failures=max_failures,
            reset_time_seconds=1,
        )
        return LLMCircuitBreaker(config=config, backend_name="claude", metrics=metrics)

    def test_rejected_half_open_outcome_emitted(self) -> None:
        """When HALF_OPEN has active probe, a second call is rejected with rejected_half_open."""
        cb = self._make_cb()
        cb.record_failure()  # CLOSED->OPEN

        # Manually advance to HALF_OPEN with probe active
        with cb._lock:
            cb._state = CircuitState.HALF_OPEN
            cb._half_open_probe_active = True

        # should_block() returns True -- probe already active
        assert cb.should_block() is True

        # call_with_retry raises CircuitBreakerOpenError with rejected_half_open
        async def _run():
            await cb.call_with_retry(lambda: (_ for _ in ()).throw(Exception("unreachable")))

        import asyncio

        from massgen.backend.llm_circuit_breaker import CircuitBreakerOpenError

        with pytest.raises(CircuitBreakerOpenError):
            asyncio.run(cb.call_with_retry(lambda: (_ for _ in ()).throw(Exception("x"))))

        rejected = [r for r in self._calls["requests"] if r.get("outcome") == "rejected_half_open"]
        assert len(rejected) >= 1, f"Expected rejected_half_open in requests, got: {self._calls['requests']}"

    def test_abnormal_probe_reopen_emits_transition(self) -> None:
        """CancelledError during HALF_OPEN probe triggers half_open->open transition."""
        cb = self._make_cb()
        cb.record_failure()  # CLOSED->OPEN

        # Advance to HALF_OPEN
        with cb._lock:
            cb._state = CircuitState.HALF_OPEN
            cb._half_open_probe_active = False

        async def _cancellable_coro():
            raise asyncio.CancelledError()

        with pytest.raises(asyncio.CancelledError):
            asyncio.run(cb.call_with_retry(_cancellable_coro))

        # CB must be OPEN after abnormal probe exit
        assert cb.state == CircuitState.OPEN

        # Transition metric half_open->open must have been emitted
        transitions = self._calls["transitions"]
        abnormal_reopens = [t for t in transitions if t.get("from_state") == "half_open" and t.get("to_state") == "open"]
        assert len(abnormal_reopens) >= 1, f"Expected half_open->open transition, got: {transitions}"


# ---------------------------------------------------------------------------
# Category 5: Round 5 additional adversarial gaps
# ---------------------------------------------------------------------------


class TestAdversarialRound5:
    """Adversarial tests added in Round 5 to close R-3 gaps."""

    def setup_method(self) -> None:
        _remove_fake()

    def teardown_method(self) -> None:
        _remove_fake()

    def test_partial_prometheus_construction_counter_ok_histogram_fails(self) -> None:
        """Counter succeeds but Histogram raises -- must not leave partial state."""
        from types import ModuleType as _ModuleType

        call_count = {"counter": 0}

        class _BadHistogram:
            def __init__(self, *a, **kw):
                raise RuntimeError("Histogram init failed")

        class _GoodCounter:
            def __init__(self, *a, **kw):
                call_count["counter"] += 1

            def labels(self, **kw):
                class _LS:
                    def inc(self):
                        pass

                return _LS()

        mod = _ModuleType("prometheus_client")
        mod.CollectorRegistry = type("R", (), {})
        mod.Counter = lambda *a, **kw: _GoodCounter(*a, **kw)
        mod.Histogram = _BadHistogram
        mod.Gauge = lambda *a, **kw: type("G", (), {"labels": lambda s, **k: type("L", (), {"set": lambda s2, v: None})()})()
        sys.modules["prometheus_client"] = mod

        m = CircuitBreakerMetrics()
        # After partial construction failure, _available must be False (no partial state)
        m.record_state_transition("test", "closed", "open")
        assert m._available is False, "After Histogram init failure, _available must be False (no partial metric state)"
        # Subsequent calls must be no-ops
        m.record_request("test", "success", 0.1)
        assert m.get_registry() is None

    def test_concurrent_get_registry_single_construction(self) -> None:
        """N threads call get_registry() on a fresh instance: constructed exactly once."""
        _build_fake_prometheus_with_counters()
        m = CircuitBreakerMetrics()

        results: list = []
        errors: list = []
        N = 50

        def _get():
            try:
                r = m.get_registry()
                results.append(r)
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=_get) for _ in range(N)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == [], f"Exceptions in threads: {errors}"
        assert len(results) == N
        # All threads must get the same non-None registry object
        assert all(r is not None for r in results), "Some threads got None registry"
        assert len({id(r) for r in results}) == 1, "Multiple distinct registry objects created -- init not idempotent under concurrency"

    def test_reentrancy_get_registry_during_record(self) -> None:
        """Calling get_registry() inside a metric callback must not deadlock (RLock)."""
        import threading as _threading
        from types import ModuleType as _ModuleType

        m_holder: list = []
        deadlock_errors: list = []

        class _ReentrantLS:
            def inc(self):
                # Re-enter get_registry() while lock may be held
                try:
                    r = m_holder[0].get_registry()
                    assert r is not None
                except Exception as exc:
                    deadlock_errors.append(exc)

            def observe(self, v):
                pass

            def set(self, v):
                pass

        class _ReentrantMetric:
            def __init__(self, name, *a, **kw):
                self._name = name

            def labels(self, **kw):
                return _ReentrantLS()

        mod = _ModuleType("prometheus_client")
        mod.CollectorRegistry = type("R", (), {})
        mod.Counter = lambda *a, **kw: _ReentrantMetric(*a, **kw)
        mod.Histogram = lambda *a, **kw: _ReentrantMetric(*a, **kw)
        mod.Gauge = lambda *a, **kw: _ReentrantMetric(*a, **kw)
        sys.modules["prometheus_client"] = mod

        m = CircuitBreakerMetrics()
        m_holder.append(m)

        # Trigger record which calls inc() which calls get_registry() recursively
        done_event = _threading.Event()

        def _run():
            try:
                m.record_state_transition("test", "closed", "open")
            except Exception as exc:
                deadlock_errors.append(exc)
            finally:
                done_event.set()

        t = _threading.Thread(target=_run, daemon=True)
        t.start()
        completed = done_event.wait(timeout=5.0)
        assert completed, "Deadlock: record_state_transition did not complete within 5s"
        assert deadlock_errors == [], f"Errors during reentrant call: {deadlock_errors}"


# ---------------------------------------------------------------------------
# Category 6: Mid-retry probe ownership transfer regression
# ---------------------------------------------------------------------------


class TestAdversarialMidRetryProbeTransfer:
    """Regression: _owns_probe tracked dynamically when circuit becomes HALF_OPEN mid-retry.

    Before the fix, _probe_was_half_open was a stale snapshot captured before the
    retry loop. If the circuit transitioned OPEN->HALF_OPEN on a later attempt, the
    except-BaseException cleanup ignored it and left _half_open_probe_active=True,
    wedging the breaker permanently.
    """

    def setup_method(self) -> None:
        _remove_fake()
        _build_fake_prometheus_with_counters()

    def teardown_method(self) -> None:
        _remove_fake()

    @pytest.mark.asyncio
    async def test_probe_flag_cleared_after_mid_retry_half_open(self) -> None:
        """Probe flag is cleared and breaker closes when OPEN->HALF_OPEN transition occurs mid-retry."""
        import time as _time

        cb = LLMCircuitBreaker(
            backend_name="test_mid_retry",
            config=LLMCircuitBreakerConfig(
                max_failures=1,
                reset_time_seconds=999.0,
                enabled=True,
            ),
        )

        # Trip the breaker to OPEN
        cb.record_failure(error_type="test")
        assert cb.state == CircuitState.OPEN

        # Expire the open window so the NEXT should_block() call transitions to HALF_OPEN
        # (simulating time passage between circuit open and call attempt)
        cb._open_until = _time.monotonic() - 1.0

        # coro_factory: first call succeeds (probe success -> CLOSED)
        # The circuit is OPEN at call_with_retry entry, but should_block() will
        # transition it to HALF_OPEN and allow this call through as the probe.
        async def succeed_on_first():
            return "ok"

        result = await cb.call_with_retry(succeed_on_first, max_retries=1)
        assert result == "ok"
        assert cb._half_open_probe_active is False, "_half_open_probe_active must be False after successful probe"
        assert cb.state == CircuitState.CLOSED, "Breaker must be CLOSED after successful probe"

    @pytest.mark.asyncio
    async def test_probe_flag_cleared_on_failed_mid_retry_half_open(self) -> None:
        """Probe flag is cleared and breaker is OPEN when probe acquired mid-retry then fails."""
        import time as _time

        cb = LLMCircuitBreaker(
            backend_name="test_mid_retry_fail",
            config=LLMCircuitBreakerConfig(
                max_failures=1,
                reset_time_seconds=999.0,
                enabled=True,
            ),
        )

        # Trip the breaker to OPEN
        cb.record_failure(error_type="test")
        assert cb.state == CircuitState.OPEN

        # Expire the window so should_block() transitions to HALF_OPEN
        cb._open_until = _time.monotonic() - 1.0

        async def always_fail():
            raise ValueError("probe failure")

        with pytest.raises(ValueError, match="probe failure"):
            await cb.call_with_retry(always_fail, max_retries=1)

        # Probe failed -- breaker must be re-opened, flag must be cleared
        assert cb._half_open_probe_active is False, "_half_open_probe_active must be False after failed probe"
        assert cb.state == CircuitState.OPEN, "Breaker must be OPEN after failed probe"
