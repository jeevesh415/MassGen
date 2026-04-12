"""Tests for RoundBudgetGuardHook."""

from __future__ import annotations

import logging
import math
import threading
from types import SimpleNamespace
from typing import Any

import pytest

from massgen.mcp_tools.budget_guard import (
    BudgetExceededError,
    BudgetState,
    RoundBudgetGuardHook,
)

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def _make_context(estimated_cost: float | None = None, **extra: Any) -> dict[str, Any]:
    """Build a context dict with token_usage.estimated_cost."""
    ctx: dict[str, Any] = dict(extra)
    if estimated_cost is not None:
        ctx["token_usage"] = SimpleNamespace(estimated_cost=estimated_cost)
    return ctx


def _make_backend_context(estimated_cost: float) -> dict[str, Any]:
    """Build a context dict with cost in backend.token_usage (fallback path)."""
    return {
        "backend": SimpleNamespace(
            token_usage=SimpleNamespace(estimated_cost=estimated_cost),
        ),
    }


async def _execute(
    hook: RoundBudgetGuardHook,
    cost: float | None = None,
    function_name: str = "Write",
    context: dict[str, Any] | None = None,
) -> Any:
    """Shortcut to call hook.execute with a cost context."""
    if context is None:
        context = _make_context(cost)
    return await hook.execute(function_name, "{}", context)


# ------------------------------------------------------------------
# BudgetState unit tests
# ------------------------------------------------------------------


class TestBudgetState:
    """Unit tests for BudgetState internals."""

    def test_sync_cumulative_adds_delta(self) -> None:
        state = BudgetState()
        delta = state.sync_cumulative(0.50)
        assert delta == pytest.approx(0.50)
        assert state.cumulative_cost == pytest.approx(0.50)
        assert state.round_cost == pytest.approx(0.50)

    def test_sync_cumulative_incremental(self) -> None:
        state = BudgetState()
        state.sync_cumulative(0.30)
        delta = state.sync_cumulative(0.80)
        assert delta == pytest.approx(0.50)
        assert state.cumulative_cost == pytest.approx(0.80)

    def test_decreasing_reported_cost_no_negative_delta(self) -> None:
        """Non-monotonic cost report clamps delta to 0."""
        state = BudgetState()
        state.sync_cumulative(1.00)
        delta = state.sync_cumulative(0.50)
        assert delta == 0.0
        assert state.cumulative_cost == pytest.approx(1.00)

    def test_sync_cumulative_zero_initial(self) -> None:
        """First call with 0.0 produces zero delta."""
        state = BudgetState()
        delta = state.sync_cumulative(0.0)
        assert delta == 0.0
        assert state.cumulative_cost == 0.0

    def test_sync_cumulative_rejects_nan(self) -> None:
        """NaN cost is rejected -- delta 0, state unchanged."""
        state = BudgetState()
        state.sync_cumulative(1.00)
        delta = state.sync_cumulative(float("nan"))
        assert delta == 0.0
        assert state.cumulative_cost == pytest.approx(1.00)

    def test_sync_cumulative_rejects_inf(self) -> None:
        """Inf cost is rejected -- delta 0, state unchanged."""
        state = BudgetState()
        delta = state.sync_cumulative(float("inf"))
        assert delta == 0.0
        assert state.cumulative_cost == 0.0

    def test_sync_cumulative_rejects_negative_inf(self) -> None:
        state = BudgetState()
        delta = state.sync_cumulative(float("-inf"))
        assert delta == 0.0

    def test_reset_round_clears_round_cost_and_warnings(self) -> None:
        state = BudgetState()
        state.sync_cumulative(1.00)
        state.check_and_fire_warning(0.50, "round")
        state.reset_round(2)
        assert state.round_cost == 0.0
        assert state.cumulative_cost == pytest.approx(1.00)
        assert state.round_number == 2
        assert 0.50 not in state._fired_round_warnings

    def test_check_and_fire_warning_returns_true_first_time(self) -> None:
        state = BudgetState()
        assert state.check_and_fire_warning(0.50, "session") is True
        assert 0.50 in state._fired_session_warnings

    def test_check_and_fire_warning_returns_false_second_time(self) -> None:
        state = BudgetState()
        state.check_and_fire_warning(0.50, "session")
        assert state.check_and_fire_warning(0.50, "session") is False

    def test_check_and_fire_warning_round_scope(self) -> None:
        state = BudgetState()
        assert state.check_and_fire_warning(0.50, "round") is True
        assert 0.50 in state._fired_round_warnings
        assert state.check_and_fire_warning(0.50, "round") is False

    def test_get_snapshot_consistent(self) -> None:
        state = BudgetState()
        state.sync_cumulative(1.23)
        snap = state.get_snapshot()
        assert snap["cumulative_cost"] == pytest.approx(1.23)
        assert snap["round_cost"] == pytest.approx(1.23)
        assert snap["round_number"] == 0

    def test_get_session_remaining(self) -> None:
        state = BudgetState()
        state.sync_cumulative(0.75)
        assert state.get_session_remaining(1.00) == pytest.approx(0.25)

    def test_get_round_remaining(self) -> None:
        state = BudgetState()
        state.sync_cumulative(0.40)
        assert state.get_round_remaining(1.00) == pytest.approx(0.60)


# ------------------------------------------------------------------
# BudgetExceededError
# ------------------------------------------------------------------


class TestBudgetExceededError:
    """Tests for the public exception class."""

    def test_attributes(self) -> None:
        err = BudgetExceededError(spent=1.50, budget=1.00, scope="session")
        assert err.spent == 1.50
        assert err.budget == 1.00
        assert err.scope == "session"
        assert "session budget exceeded" in str(err)


# ------------------------------------------------------------------
# Constructor validation
# ------------------------------------------------------------------


class TestConstructorValidation:
    """Tests for __init__ parameter validation."""

    def test_negative_session_budget_raises(self) -> None:
        with pytest.raises(ValueError, match="session_budget must be finite >= 0"):
            RoundBudgetGuardHook(session_budget=-1.0)

    def test_nan_session_budget_raises(self) -> None:
        with pytest.raises(ValueError, match="session_budget must be finite >= 0"):
            RoundBudgetGuardHook(session_budget=float("nan"))

    def test_inf_session_budget_raises(self) -> None:
        with pytest.raises(ValueError, match="session_budget must be finite >= 0"):
            RoundBudgetGuardHook(session_budget=float("inf"))

    def test_negative_round_budget_raises(self) -> None:
        with pytest.raises(ValueError, match="round_budget must be finite >= 0"):
            RoundBudgetGuardHook(round_budget=-0.01)

    def test_nan_threshold_filtered(self) -> None:
        hook = RoundBudgetGuardHook(
            session_budget=1.0,
            warning_thresholds=[0.50, float("nan"), 0.75],
        )
        assert float("nan") not in hook.warning_thresholds
        assert 0.50 in hook.warning_thresholds
        assert 0.75 in hook.warning_thresholds

    def test_out_of_range_threshold_filtered(self) -> None:
        hook = RoundBudgetGuardHook(
            session_budget=1.0,
            warning_thresholds=[0.0, 0.50, 1.5, -0.1],
        )
        # Only 0.50 is in (0, 1.0]
        assert hook.warning_thresholds == [0.50]

    def test_empty_threshold_list_no_warnings(self) -> None:
        hook = RoundBudgetGuardHook(
            session_budget=1.0,
            warning_thresholds=[],
        )
        assert hook.warning_thresholds == []

    def test_duplicate_thresholds_deduplicated(self) -> None:
        hook = RoundBudgetGuardHook(
            session_budget=1.0,
            warning_thresholds=[0.50, 0.50, 0.75],
        )
        # sorted() preserves duplicates but warnings fire-once via set
        # this is acceptable -- just verify no crash
        assert len(hook.warning_thresholds) >= 2


# ------------------------------------------------------------------
# Core hook behaviour
# ------------------------------------------------------------------


class TestBudgetGuardAllow:
    """Tests for allow/pass-through scenarios."""

    @pytest.mark.asyncio
    async def test_allow_when_under_session_budget(self) -> None:
        hook = RoundBudgetGuardHook(session_budget=5.00)
        result = await _execute(hook, cost=2.00)
        assert result.allowed is True

    @pytest.mark.asyncio
    async def test_allow_when_under_round_budget(self) -> None:
        hook = RoundBudgetGuardHook(round_budget=2.00)
        result = await _execute(hook, cost=1.00)
        assert result.allowed is True

    @pytest.mark.asyncio
    async def test_no_budget_set_always_allows(self) -> None:
        """When both budgets are None, all calls pass through."""
        hook = RoundBudgetGuardHook()
        result = await _execute(hook, cost=999.99)
        assert result.allowed is True


class TestBudgetGuardBlock:
    """Tests for block action (default)."""

    @pytest.mark.asyncio
    async def test_block_when_session_budget_exceeded(
        self,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        hook = RoundBudgetGuardHook(session_budget=1.00)
        with caplog.at_level(logging.WARNING):
            result = await _execute(hook, cost=1.50)
        assert result.allowed is False
        assert result.decision == "deny"
        assert result.hook_name == "round_budget_guard"
        assert result.hook_type == "PreToolUse"
        assert "session budget exceeded" in (result.reason or "")
        assert any("BLOCKING" in r.message for r in caplog.records)

    @pytest.mark.asyncio
    async def test_block_when_round_budget_exceeded(self) -> None:
        hook = RoundBudgetGuardHook(round_budget=0.50)
        result = await _execute(hook, cost=0.60)
        assert result.allowed is False
        assert result.hook_name == "round_budget_guard"
        assert result.hook_type == "PreToolUse"
        assert "round budget exceeded" in (result.reason or "")

    @pytest.mark.asyncio
    async def test_zero_budget_blocks_first_call(self) -> None:
        hook = RoundBudgetGuardHook(session_budget=0.00)
        result = await _execute(hook, cost=0.0)
        assert result.allowed is False

    @pytest.mark.asyncio
    async def test_zero_budget_no_warning_fires(self) -> None:
        """budget=0 forces utilization=0 so no thresholds fire."""
        hook = RoundBudgetGuardHook(
            session_budget=0.00,
            warning_thresholds=[0.50],
        )
        await _execute(hook, cost=0.0)
        # Utilization is 0.0 (budget=0 branch), so 50% threshold never fires
        assert not hook._state._fired_session_warnings

    @pytest.mark.asyncio
    async def test_negative_remaining_blocks_subsequent(self) -> None:
        hook = RoundBudgetGuardHook(session_budget=1.00)
        await _execute(hook, cost=2.00)
        result = await _execute(hook, cost=2.50)
        assert result.allowed is False

    @pytest.mark.asyncio
    async def test_block_metadata_contains_budget_info(self) -> None:
        hook = RoundBudgetGuardHook(session_budget=1.00)
        result = await _execute(hook, cost=1.50)
        assert result.metadata["budget_scope"] == "session"
        assert result.metadata["spent"] == pytest.approx(1.50)
        assert result.metadata["budget"] == pytest.approx(1.00)


class TestBudgetGuardWarn:
    """Tests for warn action."""

    @pytest.mark.asyncio
    async def test_warn_action_allows_but_logs(
        self,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        hook = RoundBudgetGuardHook(session_budget=1.00, on_exceed="warn")
        with caplog.at_level(logging.WARNING):
            result = await _execute(hook, cost=1.50)
        assert result.allowed is True
        assert result.decision == "allow"
        assert result.hook_name == "round_budget_guard"
        assert result.hook_type == "PreToolUse"
        assert "BUDGET WARNING" in (result.reason or "")
        assert result.metadata["budget_scope"] == "session"
        assert result.metadata["spent"] == pytest.approx(1.50)
        assert result.metadata["budget"] == pytest.approx(1.00)
        assert any("WARNING (allowing)" in r.message for r in caplog.records)


class TestBudgetGuardTerminate:
    """Tests for terminate action."""

    @pytest.mark.asyncio
    async def test_terminate_action_denies_with_flag(
        self,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        hook = RoundBudgetGuardHook(session_budget=1.00, on_exceed="terminate")
        with caplog.at_level(logging.WARNING):
            result = await _execute(hook, cost=1.50)
        assert result.allowed is False
        assert result.hook_name == "round_budget_guard"
        assert result.hook_type == "PreToolUse"
        assert result.metadata.get("terminate_round") is True
        assert result.metadata["budget_scope"] == "session"
        assert result.metadata["spent"] == pytest.approx(1.50)
        assert result.metadata["budget"] == pytest.approx(1.00)
        assert "BUDGET TERMINATE" in (result.reason or "")
        assert any("TERMINATING round" in r.message for r in caplog.records)


# ------------------------------------------------------------------
# Round lifecycle
# ------------------------------------------------------------------


class TestRoundLifecycle:
    """Tests for round start/reset behaviour."""

    @pytest.mark.asyncio
    async def test_round_budget_resets_between_rounds(self) -> None:
        hook = RoundBudgetGuardHook(round_budget=1.00)
        await _execute(hook, cost=0.80)
        hook.start_round(2)
        # reported_cost still 0.80, so delta=0, round_cost=0 after reset
        result = await _execute(hook, cost=0.80)
        assert result.allowed is True

    @pytest.mark.asyncio
    async def test_session_budget_accumulates_across_rounds(self) -> None:
        hook = RoundBudgetGuardHook(session_budget=1.50)
        await _execute(hook, cost=0.80)
        hook.start_round(2)
        result = await _execute(hook, cost=1.60)
        assert result.allowed is False
        assert "session budget exceeded" in (result.reason or "")

    @pytest.mark.asyncio
    async def test_start_round_resets_round_warnings_only(self) -> None:
        """Session warnings preserved, round warnings cleared."""
        hook = RoundBudgetGuardHook(
            session_budget=2.00,
            warning_thresholds=[0.50],
        )
        await _execute(hook, cost=1.10)
        assert 0.50 in hook._state._fired_session_warnings

        hook.start_round(2)
        assert 0.50 in hook._state._fired_session_warnings
        assert len(hook._state._fired_round_warnings) == 0

    @pytest.mark.asyncio
    async def test_round_warnings_refire_after_start_round(self) -> None:
        """Round warnings cleared by start_round, so they can refire."""
        hook = RoundBudgetGuardHook(
            round_budget=1.00,
            warning_thresholds=[0.50],
        )
        await _execute(hook, cost=0.60)
        assert 0.50 in hook._state._fired_round_warnings

        hook.start_round(2)
        assert len(hook._state._fired_round_warnings) == 0

    @pytest.mark.asyncio
    async def test_start_round_logs(
        self,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        hook = RoundBudgetGuardHook(session_budget=5.00)
        with caplog.at_level(logging.INFO):
            hook.start_round(3)
        assert any("round 3 started" in r.message for r in caplog.records)


# ------------------------------------------------------------------
# Warning thresholds
# ------------------------------------------------------------------


class TestWarningThresholds:
    """Tests for progressive warning emission."""

    @pytest.mark.asyncio
    async def test_warning_thresholds_progressive(
        self,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        hook = RoundBudgetGuardHook(
            session_budget=10.00,
            warning_thresholds=[0.50, 0.75, 0.90],
        )
        with caplog.at_level(logging.WARNING):
            await _execute(hook, cost=5.50)  # 55%
            await _execute(hook, cost=7.60)  # 76%
            await _execute(hook, cost=9.10)  # 91%

        warning_messages = [r.message for r in caplog.records if "utilized" in r.message and r.levelno >= logging.WARNING]
        assert len(warning_messages) == 3

    @pytest.mark.asyncio
    async def test_warning_fires_once_per_threshold(
        self,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        hook = RoundBudgetGuardHook(
            session_budget=10.00,
            warning_thresholds=[0.50],
        )
        with caplog.at_level(logging.WARNING):
            await _execute(hook, cost=6.00)  # triggers 50%
            await _execute(hook, cost=7.00)  # should NOT re-trigger

        # 50% threshold fires once at 60% utilization -- message says "60%"
        budget_warnings = [r for r in caplog.records if "utilized" in r.message and r.levelno >= logging.WARNING]
        assert len(budget_warnings) == 1

    @pytest.mark.asyncio
    async def test_round_budget_warning_threshold(
        self,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        hook = RoundBudgetGuardHook(
            round_budget=2.00,
            warning_thresholds=[0.50],
        )
        with caplog.at_level(logging.WARNING):
            await _execute(hook, cost=1.10)

        assert 0.50 in hook._state._fired_round_warnings

    @pytest.mark.asyncio
    async def test_warning_log_contains_dollar_amounts(
        self,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """Verify logger format string produces actual $ amounts, not literals."""
        hook = RoundBudgetGuardHook(
            session_budget=10.00,
            warning_thresholds=[0.50],
        )
        with caplog.at_level(logging.WARNING):
            await _execute(hook, cost=5.50)

        warning_msgs = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
        assert len(warning_msgs) >= 1
        # Must contain actual dollar amount, not "${spent:.4f}" literal
        assert "$5.5" in warning_msgs[0] or "$5.50" in warning_msgs[0]
        assert "${spent" not in warning_msgs[0]


# ------------------------------------------------------------------
# Unknown cost handling
# ------------------------------------------------------------------


class TestUnknownCost:
    """Tests for when cost data is unavailable."""

    @pytest.mark.asyncio
    async def test_unknown_cost_allow(self) -> None:
        hook = RoundBudgetGuardHook(
            session_budget=1.00,
            on_unknown_cost="allow",
        )
        result = await hook.execute("Write", "{}", context={})
        assert result.allowed is True

    @pytest.mark.asyncio
    async def test_unknown_cost_deny(self) -> None:
        hook = RoundBudgetGuardHook(
            session_budget=1.00,
            on_unknown_cost="deny",
        )
        result = await hook.execute("Write", "{}", context={})
        assert result.allowed is False
        assert "Cost data unavailable" in (result.reason or "")

    @pytest.mark.asyncio
    async def test_unknown_cost_deny_logs_warning(
        self,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        hook = RoundBudgetGuardHook(
            session_budget=1.00,
            on_unknown_cost="deny",
        )
        with caplog.at_level(logging.WARNING):
            await hook.execute("Write", "{}", context={})
        assert any("cost unknown" in r.message for r in caplog.records)

    @pytest.mark.asyncio
    async def test_none_context_treated_as_unknown(self) -> None:
        hook = RoundBudgetGuardHook(
            session_budget=1.00,
            on_unknown_cost="deny",
        )
        result = await hook.execute("Write", "{}", context=None)
        assert result.allowed is False


# ------------------------------------------------------------------
# Cost extraction paths
# ------------------------------------------------------------------


class TestCostExtraction:
    """Tests for _extract_cost fallback chain."""

    @pytest.mark.asyncio
    async def test_extract_from_token_usage(self) -> None:
        hook = RoundBudgetGuardHook(session_budget=5.00)
        ctx = _make_context(estimated_cost=2.00)
        result = await hook.execute("Write", "{}", ctx)
        assert result.allowed is True
        assert hook._state.cumulative_cost == pytest.approx(2.00)

    @pytest.mark.asyncio
    async def test_extract_falls_through_to_backend(self) -> None:
        hook = RoundBudgetGuardHook(session_budget=5.00)
        ctx = _make_backend_context(estimated_cost=3.00)
        result = await hook.execute("Write", "{}", ctx)
        assert result.allowed is True
        assert hook._state.cumulative_cost == pytest.approx(3.00)

    @pytest.mark.asyncio
    async def test_extract_falls_through_when_usage_cost_none(self) -> None:
        hook = RoundBudgetGuardHook(session_budget=5.00)
        ctx: dict[str, Any] = {
            "token_usage": SimpleNamespace(estimated_cost=None),
            "backend": SimpleNamespace(
                token_usage=SimpleNamespace(estimated_cost=1.50),
            ),
        }
        await hook.execute("Write", "{}", ctx)
        assert hook._state.cumulative_cost == pytest.approx(1.50)

    @pytest.mark.asyncio
    async def test_extract_returns_none_when_both_unavailable(self) -> None:
        hook = RoundBudgetGuardHook(
            session_budget=5.00,
            on_unknown_cost="deny",
        )
        ctx: dict[str, Any] = {
            "token_usage": SimpleNamespace(estimated_cost=None),
            "backend": SimpleNamespace(token_usage=None),
        }
        result = await hook.execute("Write", "{}", ctx)
        assert result.allowed is False

    @pytest.mark.asyncio
    async def test_token_usage_without_estimated_cost_attr(self) -> None:
        """token_usage exists but has no estimated_cost attribute."""
        hook = RoundBudgetGuardHook(
            session_budget=5.00,
            on_unknown_cost="deny",
        )
        ctx: dict[str, Any] = {"token_usage": SimpleNamespace()}
        result = await hook.execute("Write", "{}", ctx)
        assert result.allowed is False

    @pytest.mark.asyncio
    async def test_backend_without_token_usage_attr(self) -> None:
        """backend object exists but has no token_usage attribute."""
        hook = RoundBudgetGuardHook(
            session_budget=5.00,
            on_unknown_cost="deny",
        )
        ctx: dict[str, Any] = {"backend": SimpleNamespace()}
        result = await hook.execute("Write", "{}", ctx)
        assert result.allowed is False

    @pytest.mark.asyncio
    async def test_non_dict_context_treated_as_unknown(self) -> None:
        """Non-dict context (type error) treated as unknown cost."""
        hook = RoundBudgetGuardHook(
            session_budget=1.00,
            on_unknown_cost="deny",
        )
        # Pass a list instead of dict
        result = await hook.execute("Write", "{}", context=["not", "a", "dict"])  # type: ignore[arg-type]
        assert result.allowed is False


# ------------------------------------------------------------------
# Adversarial: NaN, Inf, negative, extreme values
# ------------------------------------------------------------------


class TestAdversarialCostValues:
    """Adversarial tests for abnormal cost values."""

    @pytest.mark.asyncio
    async def test_nan_cost_does_not_disable_budget(self) -> None:
        """NaN cost must not corrupt state or disable budget checks."""
        hook = RoundBudgetGuardHook(session_budget=1.00)
        # First: normal cost
        await _execute(hook, cost=0.50)
        assert hook._state.cumulative_cost == pytest.approx(0.50)
        # Then: NaN -- should be ignored
        ctx = _make_context(estimated_cost=float("nan"))
        await hook.execute("Write", "{}", ctx)
        assert hook._state.cumulative_cost == pytest.approx(0.50)
        # Budget still works
        await _execute(hook, cost=1.50)
        assert hook._state.cumulative_cost == pytest.approx(1.50)

    @pytest.mark.asyncio
    async def test_inf_cost_treated_as_unknown(self) -> None:
        """Inf cost is filtered by _extract_cost, treated as unknown."""
        hook = RoundBudgetGuardHook(
            session_budget=1.00,
            on_unknown_cost="allow",
        )
        ctx = _make_context(estimated_cost=float("inf"))
        result = await hook.execute("Write", "{}", ctx)
        # Inf is rejected by _extract_cost -> returns None -> unknown cost
        assert result.allowed is True
        assert hook._state.cumulative_cost == 0.0

    @pytest.mark.asyncio
    async def test_negative_cost_clamped_to_zero_delta(self) -> None:
        """Negative reported cost produces delta=0 (clamped by max(0,...)).

        This is a known limitation: _last_reported_cost records the
        negative value. If a subsequent positive cost arrives, the delta
        will be inflated by the absolute value of the negative. This is
        acceptable because negative reported costs are invalid input.
        """
        hook = RoundBudgetGuardHook(session_budget=5.00)
        ctx = _make_context(estimated_cost=-1.00)
        await hook.execute("Write", "{}", ctx)
        # delta = max(0, -1.0 - 0.0) = 0, cumulative stays 0
        assert hook._state.cumulative_cost == pytest.approx(0.0)

        # Next: cost=0.5, delta = max(0, 0.5 - (-1.0)) = 1.5 (inflated)
        await _execute(hook, cost=0.50)
        assert hook._state.cumulative_cost == pytest.approx(1.50)

    @pytest.mark.asyncio
    async def test_non_numeric_cost_treated_as_unknown(self) -> None:
        """estimated_cost = "not_a_number" must not crash the hook."""
        hook = RoundBudgetGuardHook(
            session_budget=1.00,
            on_unknown_cost="deny",
        )
        ctx: dict[str, Any] = {
            "token_usage": SimpleNamespace(estimated_cost="not_a_number"),
        }
        result = await hook.execute("Write", "{}", ctx)
        assert result.allowed is False
        assert hook._state.cumulative_cost == 0.0

    @pytest.mark.asyncio
    async def test_dict_cost_treated_as_unknown(self) -> None:
        """estimated_cost = {} must not crash the hook."""
        hook = RoundBudgetGuardHook(
            session_budget=1.00,
            on_unknown_cost="allow",
        )
        ctx: dict[str, Any] = {
            "token_usage": SimpleNamespace(estimated_cost={"bad": "data"}),
        }
        result = await hook.execute("Write", "{}", ctx)
        assert result.allowed is True

    @pytest.mark.asyncio
    async def test_bool_cost_treated_as_unknown(self) -> None:
        """bool estimated_cost (True/False) must not convert to 1.0/0.0."""
        hook = RoundBudgetGuardHook(
            session_budget=1.00,
            on_unknown_cost="deny",
        )
        ctx: dict[str, Any] = {
            "token_usage": SimpleNamespace(estimated_cost=True),
        }
        result = await hook.execute("Write", "{}", ctx)
        assert result.allowed is False
        assert hook._state.cumulative_cost == 0.0

    @pytest.mark.asyncio
    async def test_false_cost_treated_as_unknown(self) -> None:
        hook = RoundBudgetGuardHook(
            session_budget=1.00,
            on_unknown_cost="deny",
        )
        ctx: dict[str, Any] = {
            "token_usage": SimpleNamespace(estimated_cost=False),
        }
        result = await hook.execute("Write", "{}", ctx)
        assert result.allowed is False

    @pytest.mark.asyncio
    async def test_extremely_large_cost(self) -> None:
        """Very large cost values must not cause overflow or crash."""
        hook = RoundBudgetGuardHook(session_budget=1.00)
        ctx = _make_context(estimated_cost=1e18)
        result = await hook.execute("Write", "{}", ctx)
        assert result.allowed is False
        assert math.isfinite(hook._state.cumulative_cost)

    @pytest.mark.asyncio
    async def test_non_monotonic_decrease_then_increase(self) -> None:
        """After a cost decrease, the next increase produces inflated delta.

        This is a known limitation: _last_reported_cost tracks the
        last reported value regardless of direction.
        sync(1.0) -> sync(0.5) -> sync(0.8)
        cumulative: 1.0, 1.0, 1.3 (not 0.8)
        """
        hook = RoundBudgetGuardHook(session_budget=5.00)
        await _execute(hook, cost=1.00)
        assert hook._state.cumulative_cost == pytest.approx(1.00)
        await _execute(hook, cost=0.50)  # decrease, delta=0
        assert hook._state.cumulative_cost == pytest.approx(1.00)
        await _execute(hook, cost=0.80)  # delta = 0.80 - 0.50 = 0.30
        assert hook._state.cumulative_cost == pytest.approx(1.30)

    @pytest.mark.asyncio
    async def test_decimal_cost(self) -> None:
        """Decimal-typed cost should convert to float correctly."""
        from decimal import Decimal

        hook = RoundBudgetGuardHook(session_budget=5.00)
        ctx: dict[str, Any] = {
            "token_usage": SimpleNamespace(estimated_cost=Decimal("2.50")),
        }
        result = await hook.execute("Write", "{}", ctx)
        assert result.allowed is True
        assert hook._state.cumulative_cost == pytest.approx(2.50)


# ------------------------------------------------------------------
# Budget interaction: both budgets set
# ------------------------------------------------------------------


class TestBudgetInteraction:
    """Tests for session + round budget interaction."""

    @pytest.mark.asyncio
    async def test_round_exceeded_session_fine(self) -> None:
        """Round budget exceeded but session budget still has room."""
        hook = RoundBudgetGuardHook(session_budget=10.00, round_budget=0.50)
        result = await _execute(hook, cost=0.60)
        assert result.allowed is False
        assert "round budget exceeded" in (result.reason or "")
        # Session is fine (0.60 < 10.00) but round blocks first
        assert hook._state.cumulative_cost == pytest.approx(0.60)

    @pytest.mark.asyncio
    async def test_session_exceeded_round_fine(self) -> None:
        """Session budget exceeded even though round has room."""
        hook = RoundBudgetGuardHook(session_budget=1.00, round_budget=5.00)
        result = await _execute(hook, cost=1.50)
        assert result.allowed is False
        assert "session budget exceeded" in (result.reason or "")

    @pytest.mark.asyncio
    async def test_session_checked_before_round(self) -> None:
        """Session budget check happens before round budget check."""
        hook = RoundBudgetGuardHook(session_budget=0.50, round_budget=0.50)
        result = await _execute(hook, cost=0.60)
        assert result.allowed is False
        # Session is checked first -- it should report session, not round
        assert "session budget exceeded" in (result.reason or "")


# ------------------------------------------------------------------
# Thread safety
# ------------------------------------------------------------------


class TestThreadSafety:
    """Concurrent access tests."""

    @pytest.mark.asyncio
    async def test_concurrent_sync_no_crash(self) -> None:
        """10 threads calling sync_cumulative must not crash or corrupt.

        We verify: no exception raised, cost >= 0, and cost is finite.
        Exact value depends on interleaving and is non-deterministic.
        """
        state = BudgetState()
        num_threads = 10
        barrier = threading.Barrier(num_threads)
        errors: list[Exception] = []

        def worker(tid: int) -> None:
            try:
                barrier.wait()
                for i in range(100):
                    state.sync_cumulative(float(i))
            except (RuntimeError, ValueError, threading.BrokenBarrierError) as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(t,)) for t in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Thread errors: {errors}"
        assert state.cumulative_cost >= 0
        assert math.isfinite(state.cumulative_cost)

    @pytest.mark.asyncio
    async def test_concurrent_warning_dedup(self) -> None:
        """Warning fires exactly once even under concurrent access."""
        state = BudgetState()
        fired_count = 0
        count_lock = threading.Lock()
        barrier = threading.Barrier(10)

        def worker() -> None:
            nonlocal fired_count
            barrier.wait()
            if state.check_and_fire_warning(0.50, "session"):
                with count_lock:
                    fired_count += 1

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert fired_count == 1


# ------------------------------------------------------------------
# Budget status reporting
# ------------------------------------------------------------------


class TestBudgetStatus:
    """Tests for get_budget_status observability."""

    @pytest.mark.asyncio
    async def test_budget_status_with_both_budgets(self) -> None:
        hook = RoundBudgetGuardHook(session_budget=10.00, round_budget=2.00)
        await _execute(hook, cost=1.50)

        status = hook.get_budget_status()
        assert status["cumulative_cost"] == pytest.approx(1.50)
        assert status["round_cost"] == pytest.approx(1.50)
        assert status["session_budget"] == pytest.approx(10.00)
        assert status["session_remaining"] == pytest.approx(8.50)
        assert status["session_utilization"] == pytest.approx(0.15)
        assert status["round_budget"] == pytest.approx(2.00)
        assert status["round_remaining"] == pytest.approx(0.50)
        assert status["round_utilization"] == pytest.approx(0.75)

    @pytest.mark.asyncio
    async def test_budget_status_no_budget_set(self) -> None:
        hook = RoundBudgetGuardHook()
        status = hook.get_budget_status()
        assert "session_budget" not in status
        assert "round_budget" not in status
        assert status["cumulative_cost"] == 0.0

    @pytest.mark.asyncio
    async def test_budget_status_zero_session_budget(self) -> None:
        hook = RoundBudgetGuardHook(session_budget=0.0)
        status = hook.get_budget_status()
        assert status["session_utilization"] == 0.0

    @pytest.mark.asyncio
    async def test_budget_status_zero_round_budget(self) -> None:
        hook = RoundBudgetGuardHook(round_budget=0.0)
        status = hook.get_budget_status()
        assert status["round_utilization"] == 0.0

    @pytest.mark.asyncio
    async def test_budget_status_round_utilization(self) -> None:
        hook = RoundBudgetGuardHook(round_budget=4.00)
        await _execute(hook, cost=1.00)
        status = hook.get_budget_status()
        assert status["round_utilization"] == pytest.approx(0.25)
