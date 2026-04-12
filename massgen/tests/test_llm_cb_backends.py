"""Tests for LLM circuit breaker integration in ChatCompletions, Response API, and Gemini backends."""

from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import pytest

from massgen.backend.llm_circuit_breaker import (
    CircuitState,
    LLMCircuitBreaker,
    LLMCircuitBreakerConfig,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class FakeAPIError(Exception):
    """Test double for provider API errors."""


def _make_openai_429(retry_after=None):
    """Create a fake OpenAI-style 429 error with optional Retry-After."""
    exc = FakeAPIError("HTTP 429")
    exc.status_code = 429
    response = MagicMock()
    response.status_code = 429
    response.headers = {"retry-after": str(retry_after)} if retry_after is not None else {}
    exc.response = response
    return exc


def _enabled_config(**overrides) -> LLMCircuitBreakerConfig:
    """Return an enabled config with fast settings for tests."""
    defaults = {"enabled": True, "max_failures": 3, "reset_time_seconds": 1}
    defaults.update(overrides)
    return LLMCircuitBreakerConfig(**defaults)


# ---------------------------------------------------------------------------
# Config plumbing smoke tests
# ---------------------------------------------------------------------------


class TestChatCompletionsConfigPlumbing:
    """ChatCompletionsBackend accepts and strips CB kwargs correctly."""

    def test_accepts_cb_kwargs_without_error(self):
        from massgen.backend.chat_completions import ChatCompletionsBackend

        backend = ChatCompletionsBackend(
            llm_circuit_breaker_enabled=False,
            llm_circuit_breaker_max_failures=5,
        )
        assert isinstance(backend.circuit_breaker, LLMCircuitBreaker)

    def test_cb_disabled_by_default(self):
        from massgen.backend.chat_completions import ChatCompletionsBackend

        backend = ChatCompletionsBackend()
        assert backend.circuit_breaker.config.enabled is False

    def test_cb_kwargs_stripped_from_config(self):
        from massgen.backend.chat_completions import ChatCompletionsBackend

        backend = ChatCompletionsBackend(
            llm_circuit_breaker_enabled=True,
            llm_circuit_breaker_max_failures=7,
        )
        assert "llm_circuit_breaker_enabled" not in backend.config
        assert "llm_circuit_breaker_max_failures" not in backend.config

    def test_cb_enabled_when_requested(self):
        from massgen.backend.chat_completions import ChatCompletionsBackend

        backend = ChatCompletionsBackend(llm_circuit_breaker_enabled=True)
        assert backend.circuit_breaker.config.enabled is True

    def test_cb_max_failures_propagated(self):
        from massgen.backend.chat_completions import ChatCompletionsBackend

        backend = ChatCompletionsBackend(
            llm_circuit_breaker_enabled=True,
            llm_circuit_breaker_max_failures=10,
        )
        assert backend.circuit_breaker.config.max_failures == 10


class TestResponseBackendConfigPlumbing:
    """ResponseBackend accepts and strips CB kwargs correctly."""

    def test_accepts_cb_kwargs_without_error(self):
        from massgen.backend.response import ResponseBackend

        backend = ResponseBackend(
            llm_circuit_breaker_enabled=False,
            llm_circuit_breaker_max_failures=5,
        )
        assert isinstance(backend.circuit_breaker, LLMCircuitBreaker)

    def test_cb_disabled_by_default(self):
        from massgen.backend.response import ResponseBackend

        backend = ResponseBackend()
        assert backend.circuit_breaker.config.enabled is False

    def test_cb_kwargs_stripped_from_config(self):
        from massgen.backend.response import ResponseBackend

        backend = ResponseBackend(
            llm_circuit_breaker_enabled=True,
            llm_circuit_breaker_max_failures=7,
        )
        assert "llm_circuit_breaker_enabled" not in backend.config
        assert "llm_circuit_breaker_max_failures" not in backend.config

    def test_cb_enabled_when_requested(self):
        from massgen.backend.response import ResponseBackend

        backend = ResponseBackend(llm_circuit_breaker_enabled=True)
        assert backend.circuit_breaker.config.enabled is True

    def test_cb_max_failures_propagated(self):
        from massgen.backend.response import ResponseBackend

        backend = ResponseBackend(
            llm_circuit_breaker_enabled=True,
            llm_circuit_breaker_max_failures=10,
        )
        assert backend.circuit_breaker.config.max_failures == 10


class TestGeminiBackendConfigPlumbing:
    """GeminiBackend accepts and strips CB kwargs correctly."""

    def test_accepts_cb_kwargs_without_error(self):
        from massgen.backend.gemini import GeminiBackend

        backend = GeminiBackend(
            llm_circuit_breaker_enabled=False,
            llm_circuit_breaker_max_failures=5,
        )
        assert isinstance(backend.circuit_breaker, LLMCircuitBreaker)

    def test_cb_disabled_by_default(self):
        from massgen.backend.gemini import GeminiBackend

        backend = GeminiBackend()
        assert backend.circuit_breaker.config.enabled is False

    def test_cb_kwargs_stripped_from_config(self):
        from massgen.backend.gemini import GeminiBackend

        backend = GeminiBackend(
            llm_circuit_breaker_enabled=True,
            llm_circuit_breaker_max_failures=7,
        )
        assert "llm_circuit_breaker_enabled" not in backend.config
        assert "llm_circuit_breaker_max_failures" not in backend.config

    def test_cb_enabled_when_requested(self):
        from massgen.backend.gemini import GeminiBackend

        backend = GeminiBackend(llm_circuit_breaker_enabled=True)
        assert backend.circuit_breaker.config.enabled is True

    def test_cb_max_failures_propagated(self):
        from massgen.backend.gemini import GeminiBackend

        backend = GeminiBackend(
            llm_circuit_breaker_enabled=True,
            llm_circuit_breaker_max_failures=10,
        )
        assert backend.circuit_breaker.config.max_failures == 10


# ---------------------------------------------------------------------------
# State transitions via CB instance on backends
# ---------------------------------------------------------------------------


class TestBackendCBStateTransitions:
    """Verify CB instance on backend transitions correctly through states."""

    def _make_cb(self, **cfg_overrides) -> LLMCircuitBreaker:
        """Create a standalone enabled CB for state-transition tests."""
        return LLMCircuitBreaker(config=_enabled_config(**cfg_overrides))

    def test_closed_to_open_after_max_failures(self):
        cb = self._make_cb(max_failures=3)
        assert cb.state == CircuitState.CLOSED
        for _ in range(3):
            cb.record_failure(error_type="test")
        assert cb.state == CircuitState.OPEN

    def test_open_to_half_open_after_reset_time(self):
        cb = self._make_cb(max_failures=1, reset_time_seconds=1)
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        time.sleep(1.1)
        # should_block triggers the OPEN -> HALF_OPEN transition
        blocked = cb.should_block()
        assert blocked is False
        assert cb.state == CircuitState.HALF_OPEN

    def test_half_open_to_closed_on_success(self):
        cb = self._make_cb(max_failures=1, reset_time_seconds=1)
        cb.record_failure()
        time.sleep(1.1)
        cb.should_block()  # OPEN -> HALF_OPEN
        assert cb.state == CircuitState.HALF_OPEN
        cb.record_success()
        assert cb.state == CircuitState.CLOSED
        assert cb.failure_count == 0

    def test_half_open_to_open_on_failure(self):
        cb = self._make_cb(max_failures=1, reset_time_seconds=1)
        cb.record_failure()
        time.sleep(1.1)
        cb.should_block()  # OPEN -> HALF_OPEN
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

    def test_chatcompletions_backend_cb_state_transition(self):
        """CB on ChatCompletionsBackend transitions CLOSED -> OPEN -> HALF_OPEN -> CLOSED."""
        from massgen.backend.chat_completions import ChatCompletionsBackend

        backend = ChatCompletionsBackend(
            llm_circuit_breaker_enabled=True,
            llm_circuit_breaker_max_failures=2,
            llm_circuit_breaker_reset_time_seconds=1,
        )
        cb = backend.circuit_breaker
        assert cb.state == CircuitState.CLOSED

        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.OPEN

        time.sleep(1.1)
        cb.should_block()
        assert cb.state == CircuitState.HALF_OPEN

        cb.record_success()
        assert cb.state == CircuitState.CLOSED


# ---------------------------------------------------------------------------
# Disabled bypass
# ---------------------------------------------------------------------------


class TestDisabledBypassViaBackend:
    """When enabled=False (default), should_block() always returns False."""

    def test_chatcompletions_disabled_never_blocks(self):
        from massgen.backend.chat_completions import ChatCompletionsBackend

        backend = ChatCompletionsBackend()
        cb = backend.circuit_breaker
        # Force many failures -- should have no effect when disabled
        for _ in range(100):
            cb.record_failure()
        assert cb.should_block() is False
        assert cb.failure_count == 0

    def test_response_disabled_never_blocks(self):
        from massgen.backend.response import ResponseBackend

        backend = ResponseBackend()
        cb = backend.circuit_breaker
        for _ in range(100):
            cb.record_failure()
        assert cb.should_block() is False
        assert cb.failure_count == 0

    def test_gemini_disabled_never_blocks(self):
        from massgen.backend.gemini import GeminiBackend

        backend = GeminiBackend()
        cb = backend.circuit_breaker
        for _ in range(100):
            cb.record_failure()
        assert cb.should_block() is False
        assert cb.failure_count == 0


# ---------------------------------------------------------------------------
# 429 classification via call_with_retry (LLMCircuitBreaker directly)
# ---------------------------------------------------------------------------


class TestCallWithRetry429Classifications:
    """429 WAIT / STOP / CAP classification through call_with_retry."""

    @pytest.mark.asyncio
    async def test_wait_short_retry_after_retries_no_failure_increment(self):
        """WAIT: short Retry-After -> retry, failure counter stays 0."""
        cb = LLMCircuitBreaker(config=_enabled_config(retry_after_threshold_seconds=60))
        call_count = 0

        async def api_call():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise _make_openai_429(retry_after=10)
            return "ok"

        with patch("massgen.backend.llm_circuit_breaker.asyncio.sleep") as mock_sleep:
            mock_sleep.return_value = None
            result = await cb.call_with_retry(api_call)

        assert result == "ok"
        assert call_count == 2
        # WAIT honors Retry-After value
        mock_sleep.assert_awaited_once_with(10)
        # WAIT does not increment failure counter
        assert cb.failure_count == 0

    @pytest.mark.asyncio
    async def test_stop_long_retry_after_forces_cb_open(self):
        """STOP: long Retry-After -> CB forced open, no retry."""
        cb = LLMCircuitBreaker(config=_enabled_config(retry_after_threshold_seconds=60))
        call_count = 0

        async def api_call():
            nonlocal call_count
            call_count += 1
            raise _make_openai_429(retry_after=600)

        with pytest.raises(FakeAPIError):
            await cb.call_with_retry(api_call)

        # Only one attempt -- STOP does not retry
        assert call_count == 1
        assert cb.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_cap_no_retry_after_increments_failure_counter(self):
        """CAP: no Retry-After -> failure counter increments."""
        cb = LLMCircuitBreaker(config=_enabled_config(max_failures=10))

        async def api_call():
            raise _make_openai_429(retry_after=None)  # CAP

        with patch("massgen.backend.llm_circuit_breaker.asyncio.sleep") as mock_sleep:
            mock_sleep.return_value = None
            with pytest.raises(FakeAPIError):
                await cb.call_with_retry(api_call, max_retries=3)

        # 3 CAP failures recorded
        assert cb.failure_count == 3

    @pytest.mark.asyncio
    async def test_cap_retries_before_exhaustion(self):
        """CAP: backoff-retry succeeds on second attempt."""
        cb = LLMCircuitBreaker(config=_enabled_config(max_failures=10))
        call_count = 0

        async def api_call():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise _make_openai_429(retry_after=None)
            return "recovered"

        with patch("massgen.backend.llm_circuit_breaker.asyncio.sleep") as mock_sleep:
            mock_sleep.return_value = None
            result = await cb.call_with_retry(api_call, max_retries=3)

        assert result == "recovered"
        assert call_count == 2
        # record_success resets the counter
        assert cb.failure_count == 0


# ---------------------------------------------------------------------------
# Gemini 503 handling
# ---------------------------------------------------------------------------


class TestGemini503Handling:
    """record_failure('exhausted_503', ...) increments counter; after max_failures, blocks."""

    def test_503_increments_failure_counter(self):
        cb = LLMCircuitBreaker(config=_enabled_config(max_failures=5))
        cb.record_failure("exhausted_503", "Service Unavailable")
        assert cb.failure_count == 1
        assert cb.state == CircuitState.CLOSED

    def test_503_repeated_failures_open_cb(self):
        cb = LLMCircuitBreaker(config=_enabled_config(max_failures=3))
        for _ in range(3):
            cb.record_failure("exhausted_503", "Service Unavailable")
        assert cb.state == CircuitState.OPEN
        assert cb.should_block() is True

    @pytest.mark.asyncio
    async def test_503_via_call_with_retry_records_failure(self):
        """HTTP 503 in retryable_status_codes increments failure counter."""
        cb = LLMCircuitBreaker(config=_enabled_config(max_failures=10))

        exc = FakeAPIError("HTTP 503")
        exc.status_code = 503

        async def api_call():
            raise exc

        with patch("massgen.backend.llm_circuit_breaker.asyncio.sleep") as mock_sleep:
            mock_sleep.return_value = None
            with pytest.raises(FakeAPIError):
                await cb.call_with_retry(api_call, max_retries=2)

        assert cb.failure_count == 2

    def test_503_does_not_increment_when_disabled(self):
        """When CB is disabled, record_failure is a no-op."""
        cb = LLMCircuitBreaker(config=LLMCircuitBreakerConfig(enabled=False))
        for _ in range(100):
            cb.record_failure("exhausted_503", "Service Unavailable")
        assert cb.should_block() is False
        assert cb.state == CircuitState.CLOSED


# ---------------------------------------------------------------------------
# Config validation
# ---------------------------------------------------------------------------


class TestCBConfigValidation:
    """Backends reject invalid CB config at construction time."""

    def test_chatcompletions_rejects_negative_max_failures(self):
        from massgen.backend.chat_completions import ChatCompletionsBackend

        with pytest.raises(ValueError, match="max_failures"):
            ChatCompletionsBackend(
                llm_circuit_breaker_enabled=True,
                llm_circuit_breaker_max_failures=-1,
            )

    def test_response_rejects_negative_max_failures(self):
        from massgen.backend.response import ResponseBackend

        with pytest.raises(ValueError, match="max_failures"):
            ResponseBackend(
                llm_circuit_breaker_enabled=True,
                llm_circuit_breaker_max_failures=-1,
            )

    def test_gemini_rejects_negative_max_failures(self):
        from massgen.backend.gemini import GeminiBackend

        with pytest.raises(ValueError, match="max_failures"):
            GeminiBackend(
                llm_circuit_breaker_enabled=True,
                llm_circuit_breaker_max_failures=-1,
            )

    def test_config_dataclass_rejects_max_failures_zero(self):
        with pytest.raises(ValueError, match="max_failures"):
            LLMCircuitBreakerConfig(max_failures=0)

    def test_config_dataclass_rejects_max_failures_negative(self):
        with pytest.raises(ValueError, match="max_failures"):
            LLMCircuitBreakerConfig(max_failures=-1)

    def test_config_dataclass_rejects_invalid_reset_time(self):
        with pytest.raises(ValueError, match="reset_time_seconds"):
            LLMCircuitBreakerConfig(reset_time_seconds=0)

    def test_chatcompletions_rejects_invalid_reset_time(self):
        from massgen.backend.chat_completions import ChatCompletionsBackend

        with pytest.raises(ValueError, match="reset_time_seconds"):
            ChatCompletionsBackend(
                llm_circuit_breaker_enabled=True,
                llm_circuit_breaker_reset_time_seconds=0,
            )

    def test_response_rejects_invalid_reset_time(self):
        from massgen.backend.response import ResponseBackend

        with pytest.raises(ValueError, match="reset_time_seconds"):
            ResponseBackend(
                llm_circuit_breaker_enabled=True,
                llm_circuit_breaker_reset_time_seconds=0,
            )

    def test_gemini_rejects_invalid_reset_time(self):
        from massgen.backend.gemini import GeminiBackend

        with pytest.raises(ValueError, match="reset_time_seconds"):
            GeminiBackend(
                llm_circuit_breaker_enabled=True,
                llm_circuit_breaker_reset_time_seconds=0,
            )


# ---------------------------------------------------------------------------
# Integration: CB OPEN raises CircuitBreakerOpenError through backend
# ---------------------------------------------------------------------------


class TestCBOpenRaisesErrorThroughBackend:
    """When CB is OPEN, backend API calls raise CircuitBreakerOpenError."""

    @pytest.mark.asyncio
    async def test_chatcompletions_raises_when_cb_open(self):
        from massgen.backend.chat_completions import ChatCompletionsBackend
        from massgen.backend.llm_circuit_breaker import CircuitBreakerOpenError

        backend = ChatCompletionsBackend(
            llm_circuit_breaker_enabled=True,
            llm_circuit_breaker_max_failures=1,
        )
        # Force CB open
        backend.circuit_breaker.record_failure("test", "force open")
        assert backend.circuit_breaker.state == CircuitState.OPEN

        # call_with_retry should raise immediately
        async def _dummy():
            return "should not reach"

        with pytest.raises(CircuitBreakerOpenError):
            await backend.circuit_breaker.call_with_retry(_dummy)

    @pytest.mark.asyncio
    async def test_response_raises_when_cb_open(self):
        from massgen.backend.llm_circuit_breaker import CircuitBreakerOpenError
        from massgen.backend.response import ResponseBackend

        backend = ResponseBackend(
            llm_circuit_breaker_enabled=True,
            llm_circuit_breaker_max_failures=1,
        )
        backend.circuit_breaker.record_failure("test", "force open")
        assert backend.circuit_breaker.state == CircuitState.OPEN

        async def _dummy():
            return "should not reach"

        with pytest.raises(CircuitBreakerOpenError):
            await backend.circuit_breaker.call_with_retry(_dummy)

    @pytest.mark.asyncio
    async def test_gemini_raises_when_cb_open(self):
        """Gemini uses should_block() gate -- verify CB blocks via call_with_retry."""
        from massgen.backend.gemini import GeminiBackend
        from massgen.backend.llm_circuit_breaker import CircuitBreakerOpenError

        backend = GeminiBackend(
            llm_circuit_breaker_enabled=True,
            llm_circuit_breaker_max_failures=1,
        )
        backend.circuit_breaker.record_failure("test", "force open")
        assert backend.circuit_breaker.state == CircuitState.OPEN

        # Gemini uses should_block() directly, but call_with_retry also blocks
        async def _dummy():
            return "should not reach"

        with pytest.raises(CircuitBreakerOpenError, match="Circuit breaker is open"):
            await backend.circuit_breaker.call_with_retry(_dummy)
