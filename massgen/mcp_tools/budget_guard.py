"""Budget enforcement hook for MassGen.

PRE_TOOL_USE hook that checks cumulative cost against configurable
session and round budgets. When exceeded, blocks further tool
execution, logs a warning, or gracefully terminates the round.

Addresses Issue #781 (per-round cost awareness) and related
Issue #994 (cost overrun in managed round evaluator).
"""

from __future__ import annotations

import logging
import math
import threading
from dataclasses import dataclass, field
from typing import Any, Literal

from massgen.mcp_tools.hooks import HookResult, PatternHook

logger = logging.getLogger(__name__)

DEFAULT_WARNING_THRESHOLDS = [0.50, 0.75, 0.90]
_HOOK_TIMEOUT_SECONDS = 5


@dataclass
class BudgetState:
    """Thread-safe budget tracking state.

    All mutations go through the provided methods which acquire
    the internal lock. Read-only field access is safe on CPython
    (GIL guarantees atomic float reads), but callers should prefer
    the method API for multi-field consistency.
    """

    cumulative_cost: float = 0.0
    round_cost: float = 0.0
    round_number: int = 0
    _last_reported_cost: float = field(default=0.0, init=False, repr=False)
    _lock: threading.Lock = field(
        default_factory=threading.Lock,
        init=False,
        repr=False,
    )
    _fired_session_warnings: set[float] = field(
        default_factory=set,
        init=False,
        repr=False,
    )
    _fired_round_warnings: set[float] = field(
        default_factory=set,
        init=False,
        repr=False,
    )

    def sync_cumulative(self, reported_cost: float) -> float:
        """Update cumulative cost from an external cost source.

        Computes the delta since the last sync and adds it to both
        cumulative and round totals. Handles non-monotonic cost
        reports gracefully (delta clamped to >= 0).

        NaN and Inf costs are rejected -- returns 0.0 delta.

        Returns the delta applied.
        """
        if not math.isfinite(reported_cost):
            return 0.0
        with self._lock:
            delta = max(0.0, reported_cost - self._last_reported_cost)
            self._last_reported_cost = reported_cost
            self.cumulative_cost += delta
            self.round_cost += delta
            return delta

    def reset_round(self, round_number: int) -> None:
        """Reset round-scoped cost and round-scoped warnings atomically."""
        with self._lock:
            self.round_cost = 0.0
            self.round_number = round_number
            self._fired_round_warnings.clear()

    def check_and_fire_warning(
        self,
        threshold: float,
        scope: Literal["session", "round"],
    ) -> bool:
        """Atomically check and fire a warning threshold.

        Returns True if the warning was newly fired (first time),
        False if already fired.
        """
        warnings = self._fired_session_warnings if scope == "session" else self._fired_round_warnings
        with self._lock:
            if threshold in warnings:
                return False
            warnings.add(threshold)
            return True

    def get_snapshot(self) -> dict[str, float]:
        """Return a consistent snapshot of cost state under lock."""
        with self._lock:
            return {
                "cumulative_cost": self.cumulative_cost,
                "round_cost": self.round_cost,
                "round_number": self.round_number,
            }

    def get_session_remaining(self, budget: float) -> float:
        """Return remaining session budget. Negative means exceeded."""
        return budget - self.cumulative_cost

    def get_round_remaining(self, budget: float) -> float:
        """Return remaining round budget. Negative means exceeded."""
        return budget - self.round_cost


class BudgetExceededError(Exception):
    """Signals that the cost budget has been exceeded.

    This exception is never raised inside the hook itself -- the hook
    returns HookResult(allowed=False) instead. This class is provided
    for callers who prefer exception-based flow control when
    integrating the budget guard programmatically.
    """

    def __init__(
        self,
        spent: float,
        budget: float,
        scope: Literal["session", "round"],
    ) -> None:
        self.spent = spent
        self.budget = budget
        self.scope = scope
        super().__init__(
            f"{scope} budget exceeded: ${spent:.4f} spent, " f"${budget:.4f} limit",
        )


class RoundBudgetGuardHook(PatternHook):
    """PRE_TOOL_USE hook that enforces configurable cost budgets.

    Checks cumulative cost against session and/or round limits before
    each tool execution. When a limit is exceeded, takes the configured
    action: block the call, log a warning, or signal round termination.

    Thread safety: the internal BudgetState uses a threading.Lock for
    all mutations. Cost reads inside execute() are not atomic with
    the subsequent decision, so a small TOCTOU window exists under
    extreme concurrency -- this is acceptable because overshoot by
    one tool call is the worst case.
    """

    def __init__(
        self,
        session_budget: float | None = None,
        round_budget: float | None = None,
        on_exceed: Literal["block", "warn", "terminate"] = "block",
        warning_thresholds: list[float] | None = None,
        on_unknown_cost: Literal["allow", "deny"] = "allow",
        matcher: str = "*",
    ) -> None:
        """Initialize the budget guard hook.

        Args:
            session_budget: Maximum cumulative cost in USD for the entire
                session. None disables session-level enforcement.
            round_budget: Maximum cost in USD per orchestration round.
                None disables round-level enforcement.
            on_exceed: Action when budget is exceeded. "block" denies the
                tool call, "warn" allows but logs, "terminate" denies with
                a terminate_round flag in metadata.
            warning_thresholds: Utilization fractions at which progressive
                warnings fire. Values must be in (0, 1.0]. Defaults to
                [0.50, 0.75, 0.90]. Invalid values are silently filtered.
            on_unknown_cost: Behavior when cost data is unavailable in the
                hook context. "allow" proceeds, "deny" blocks.
            matcher: Glob pattern for tool name matching. Defaults to "*".

        Raises:
            ValueError: If session_budget or round_budget is negative or
                non-finite.
        """
        if session_budget is not None and (not math.isfinite(session_budget) or session_budget < 0):
            raise ValueError(f"session_budget must be finite >= 0, got {session_budget}")
        if round_budget is not None and (not math.isfinite(round_budget) or round_budget < 0):
            raise ValueError(f"round_budget must be finite >= 0, got {round_budget}")
        super().__init__(
            name="round_budget_guard",
            matcher=matcher,
            timeout=_HOOK_TIMEOUT_SECONDS,
        )
        self.session_budget = session_budget
        self.round_budget = round_budget
        self.on_exceed = on_exceed
        raw_thresholds = warning_thresholds if warning_thresholds is not None else DEFAULT_WARNING_THRESHOLDS
        self.warning_thresholds = sorted(t for t in raw_thresholds if math.isfinite(t) and 0 < t <= 1.0)
        self.on_unknown_cost = on_unknown_cost
        self._state = BudgetState()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def execute(
        self,
        function_name: str,
        arguments: str,
        context: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> HookResult:
        """Check budget before tool execution.

        Cost is extracted from context["token_usage"].estimated_cost
        (preferred) or context["backend"].token_usage.estimated_cost
        (fallback). If neither is available, behaviour is governed by
        on_unknown_cost.
        """
        cost = self._extract_cost(context)

        if cost is None:
            return self._handle_unknown_cost(function_name)

        # Sync external cost into our state
        self._state.sync_cumulative(cost)

        # Check session budget
        if self.session_budget is not None:
            result = self._check_budget(
                spent=self._state.cumulative_cost,
                budget=self.session_budget,
                scope="session",
                function_name=function_name,
            )
            if result is not None:
                return result

        # Check round budget
        if self.round_budget is not None:
            result = self._check_budget(
                spent=self._state.round_cost,
                budget=self.round_budget,
                scope="round",
                function_name=function_name,
            )
            if result is not None:
                return result

        return HookResult(allowed=True)

    def start_round(self, round_number: int) -> None:
        """Signal the start of a new round.

        Atomically resets round-scoped cost and round-scoped warning
        state. Session warnings are preserved across rounds.
        """
        self._state.reset_round(round_number)
        logger.info(
            "budget_guard: round %d started, round cost reset",
            round_number,
        )

    def get_budget_status(self) -> dict[str, Any]:
        """Return a consistent snapshot of budget status for observability."""
        snap = self._state.get_snapshot()
        status: dict[str, Any] = {
            "cumulative_cost": snap["cumulative_cost"],
            "round_cost": snap["round_cost"],
            "round_number": snap["round_number"],
        }
        if self.session_budget is not None:
            status["session_budget"] = self.session_budget
            status["session_remaining"] = self.session_budget - snap["cumulative_cost"]
            status["session_utilization"] = snap["cumulative_cost"] / self.session_budget if self.session_budget > 0 else 0.0
        if self.round_budget is not None:
            status["round_budget"] = self.round_budget
            status["round_remaining"] = self.round_budget - snap["round_cost"]
            status["round_utilization"] = snap["round_cost"] / self.round_budget if self.round_budget > 0 else 0.0
        return status

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _extract_cost(self, context: dict[str, Any] | None) -> float | None:
        """Extract cumulative cost from hook context.

        Tries context["token_usage"].estimated_cost first, then falls
        back to context["backend"].token_usage.estimated_cost. Returns
        None if cost data is unavailable.
        """
        if not isinstance(context, dict):
            return None

        # Primary: token_usage object in context
        token_usage = context.get("token_usage")
        if token_usage is not None:
            result = self._safe_float(getattr(token_usage, "estimated_cost", None))
            if result is not None:
                return result

        # Fallback: backend.token_usage
        backend = context.get("backend")
        if backend is not None:
            backend_usage = getattr(backend, "token_usage", None)
            if backend_usage is not None:
                result = self._safe_float(
                    getattr(backend_usage, "estimated_cost", None),
                )
                if result is not None:
                    return result

        return None

    @staticmethod
    def _safe_float(value: Any) -> float | None:
        """Convert value to float, returning None on failure or non-finite.

        Rejects bool (True/False would silently convert to 1.0/0.0,
        masking upstream bugs where estimated_cost is a flag).
        """
        if value is None or isinstance(value, bool):
            return None
        try:
            converted = float(value)
        except (TypeError, ValueError):
            return None
        return converted if math.isfinite(converted) else None

    def _handle_unknown_cost(self, function_name: str) -> HookResult:
        """Decide what to do when cost data is unavailable."""
        if self.on_unknown_cost == "deny":
            logger.warning(
                "budget_guard: cost unknown for %s, denying (on_unknown_cost=deny)",
                function_name,
            )
            return HookResult(
                allowed=False,
                decision="deny",
                reason="Cost data unavailable and on_unknown_cost=deny",
                hook_name=self.name,
                hook_type="PreToolUse",
            )
        logger.debug(
            "budget_guard: cost unknown for %s, allowing (on_unknown_cost=allow)",
            function_name,
        )
        return HookResult(allowed=True)

    def _check_budget(
        self,
        spent: float,
        budget: float,
        scope: Literal["session", "round"],
        function_name: str,
    ) -> HookResult | None:
        """Check if budget is exceeded and emit warnings.

        Returns a HookResult if the budget is exceeded (action taken),
        or None if the call should proceed. Warning deduplication is
        handled atomically inside BudgetState.check_and_fire_warning().
        """
        utilization = spent / budget if budget > 0 else 0.0

        # Progressive warnings (fire each threshold at most once, atomically)
        for threshold in self.warning_thresholds:
            if utilization >= threshold:
                if self._state.check_and_fire_warning(threshold, scope):
                    logger.warning(
                        "budget_guard: %s budget %.0f%% utilized " "($%.4f / $%.4f) at tool %s",
                        scope,
                        utilization * 100,
                        spent,
                        budget,
                        function_name,
                    )

        # Budget exceeded
        if spent >= budget:
            return self._apply_exceed_action(
                spent=spent,
                budget=budget,
                scope=scope,
                function_name=function_name,
            )

        return None

    def _apply_exceed_action(
        self,
        spent: float,
        budget: float,
        scope: Literal["session", "round"],
        function_name: str,
    ) -> HookResult:
        """Apply the configured exceed action and return a HookResult."""
        reason = f"{scope} budget exceeded: ${spent:.4f} spent, " f"${budget:.4f} limit"

        if self.on_exceed == "block":
            logger.warning(
                "budget_guard: BLOCKING %s -- %s",
                function_name,
                reason,
            )
            return HookResult(
                allowed=False,
                decision="deny",
                reason=reason,
                hook_name=self.name,
                hook_type="PreToolUse",
                metadata={"budget_scope": scope, "spent": spent, "budget": budget},
            )

        if self.on_exceed == "warn":
            logger.warning(
                "budget_guard: WARNING (allowing) %s -- %s",
                function_name,
                reason,
            )
            return HookResult(
                allowed=True,
                decision="allow",
                reason=f"[BUDGET WARNING] {reason}",
                hook_name=self.name,
                hook_type="PreToolUse",
                metadata={"budget_scope": scope, "spent": spent, "budget": budget},
            )

        # on_exceed == "terminate"
        logger.warning(
            "budget_guard: TERMINATING round -- %s at tool %s",
            reason,
            function_name,
        )
        return HookResult(
            allowed=False,
            decision="deny",
            reason=f"[BUDGET TERMINATE] {reason}",
            hook_name=self.name,
            hook_type="PreToolUse",
            metadata={
                "budget_scope": scope,
                "spent": spent,
                "budget": budget,
                "terminate_round": True,
            },
        )
