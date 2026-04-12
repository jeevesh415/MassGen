"""Tests for the execution trace analyzer integration.

Covers:
- CLI wiring of ``enable_execution_trace_analyzer`` from YAML coordination config
- TUI spawn event payload includes both tasks when trace analyzer is enabled
- Memory formatting with YAML frontmatter
- Context path isolation (trace analyzer gets focused paths, not full workspace)
- Delegation targets exclude analytical subagent types
- next_tasks.json validation robustness
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Fix 2: CLI wiring
# ---------------------------------------------------------------------------


def test_parse_coordination_config_wires_enable_execution_trace_analyzer():
    """_parse_coordination_config should forward enable_execution_trace_analyzer."""
    from massgen.cli import _parse_coordination_config

    coord_cfg: dict[str, Any] = {"enable_execution_trace_analyzer": True}
    result = _parse_coordination_config(coord_cfg)
    assert result.enable_execution_trace_analyzer is True

    coord_cfg_off: dict[str, Any] = {}
    result_off = _parse_coordination_config(coord_cfg_off)
    assert result_off.enable_execution_trace_analyzer is False


# ---------------------------------------------------------------------------
# Fixes 6 + 7: Memory formatting (frontmatter, no truncation)
# ---------------------------------------------------------------------------


def test_format_trace_analyzer_for_memory():
    """The memory block must start with YAML frontmatter and include the full report."""
    from massgen.orchestrator import Orchestrator
    from massgen.subagent.models import SubagentResult

    long_report = "A" * 5000  # Exceeds old 3000-char truncation
    trace_result = SubagentResult.create_success(
        subagent_id="trace_analyzer_r3",
        answer=long_report,
        workspace_path="/tmp/fake",
        execution_time_seconds=10.0,
    )

    block = Orchestrator._format_trace_analyzer_for_memory_static(trace_result, 3)
    assert block is not None
    assert block.startswith("---\n")
    assert "name: execution_trace_round_3" in block
    assert "tier: short_term" in block
    # Full report must be present (no truncation).
    assert long_report in block


def test_format_trace_analyzer_for_memory_empty_answer():
    """An empty/whitespace answer should return None (nothing to remember)."""
    from massgen.orchestrator import Orchestrator
    from massgen.subagent.models import SubagentResult

    trace_result = SubagentResult.create_success(
        subagent_id="trace_analyzer_r1",
        answer="   ",
        workspace_path="/tmp/fake",
        execution_time_seconds=1.0,
    )
    assert Orchestrator._format_trace_analyzer_for_memory_static(trace_result, 1) is None


# ---------------------------------------------------------------------------
# Direct spawn fallback (no filesystem_manager)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_round_evaluator_always_uses_direct_spawn(
    mock_orchestrator,
):
    """Orchestrator-managed round evaluator should always use the direct spawn
    path (bypassing MCP routing), regardless of filesystem_manager state."""
    from massgen.agent_config import AgentConfig, CoordinationConfig

    coord = CoordinationConfig(
        orchestrator_managed_round_evaluator=True,
        enable_execution_trace_analyzer=False,
    )
    config = AgentConfig(coordination_config=coord)
    orchestrator = mock_orchestrator(num_agents=1, config=config)
    agent_id = next(iter(orchestrator.agents))

    # Confirm the mock agent has no filesystem_manager (reproduces the codex bug).
    assert orchestrator.agents[agent_id].backend.filesystem_manager is None

    # Seed state so the gate considers it necessary to run.
    orchestrator.agent_states[agent_id].answer = "some answer"
    orchestrator._round_evaluator_completed_labels[agent_id] = None

    # Stub helpers.
    orchestrator._is_round_evaluator_gate_enabled = lambda: True
    orchestrator._get_round_evaluator_latest_labels = lambda _ans: ("label",)
    orchestrator._get_round_evaluator_upcoming_round = lambda _aid: 2
    orchestrator._get_round_evaluator_display_round = lambda _aid: 2
    orchestrator._set_round_evaluator_task_mode = lambda *a, **kw: None
    orchestrator._build_round_evaluator_task = lambda _aid, _ans: "eval task"
    orchestrator._get_round_evaluator_context_paths = lambda _aid, **kw: []
    orchestrator._emit_round_evaluator_spawn_event = lambda **kw: None
    orchestrator._copy_all_snapshots_to_temp_workspace = AsyncMock(return_value=None)

    # Track which spawn path was used.
    mcp_called = False
    direct_called = False

    async def _fake_mcp_call(*args, **kwargs):
        nonlocal mcp_called
        mcp_called = True
        return {"success": True, "results": [{"subagent_id": "round_eval_r2", "status": "completed", "answer": "ok", "workspace_path": "/tmp/fake"}]}

    async def _fake_direct_spawn(*args, **kwargs):
        nonlocal direct_called
        direct_called = True
        return {"success": True, "results": [{"subagent_id": "round_eval_r2", "status": "completed", "answer": "ok", "workspace_path": "/tmp/fake"}]}

    orchestrator._call_subagent_mcp_tool_async = _fake_mcp_call
    orchestrator._direct_spawn_subagents = _fake_direct_spawn
    orchestrator._handle_round_evaluator_gate_failure = lambda **kw: False
    orchestrator._queue_round_start_context_block = lambda *a: None

    with patch("massgen.orchestrator.get_event_emitter", return_value=None):
        try:
            await orchestrator._run_round_evaluator_pre_round_if_needed(
                answers={agent_id: "some answer"},
            )
        except Exception:
            pass

    # Direct spawn should always be used for orchestrator-managed round evaluator.
    assert direct_called, "Expected direct spawn path for orchestrator-managed round evaluator"
    assert not mcp_called, "MCP path should NOT be used for orchestrator-managed round evaluator"


@pytest.mark.asyncio
async def test_round_evaluator_direct_spawn_also_used_with_filesystem_manager(
    mock_orchestrator,
):
    """Even when agent has filesystem_manager, orchestrator-managed round
    evaluator should use direct spawn — MCP routing is never needed."""
    from massgen.agent_config import AgentConfig, CoordinationConfig

    coord = CoordinationConfig(
        orchestrator_managed_round_evaluator=True,
        enable_execution_trace_analyzer=False,
    )
    config = AgentConfig(coordination_config=coord)
    orchestrator = mock_orchestrator(num_agents=1, config=config)
    agent_id = next(iter(orchestrator.agents))

    # Give the mock agent a filesystem_manager.
    mock_fs = MagicMock()
    mock_fs.get_workspace_root.return_value = "/tmp/fake_workspace"
    mock_fs.cwd = "/tmp/fake_workspace"
    mock_fs.agent_temporary_workspace = None
    orchestrator.agents[agent_id].backend.filesystem_manager = mock_fs

    # Seed state.
    orchestrator.agent_states[agent_id].answer = "some answer"
    orchestrator._round_evaluator_completed_labels[agent_id] = None

    # Stub helpers.
    orchestrator._is_round_evaluator_gate_enabled = lambda: True
    orchestrator._get_round_evaluator_latest_labels = lambda _ans: ("label",)
    orchestrator._get_round_evaluator_upcoming_round = lambda _aid: 2
    orchestrator._get_round_evaluator_display_round = lambda _aid: 2
    orchestrator._set_round_evaluator_task_mode = lambda *a, **kw: None
    orchestrator._build_round_evaluator_task = lambda _aid, _ans: "eval task"
    orchestrator._get_round_evaluator_context_paths = lambda _aid, **kw: []
    orchestrator._emit_round_evaluator_spawn_event = lambda **kw: None
    orchestrator._copy_all_snapshots_to_temp_workspace = AsyncMock(return_value=None)

    direct_called = False
    mcp_called = False

    async def _fake_direct_spawn(*args, **kwargs):
        nonlocal direct_called
        direct_called = True
        return {"success": True, "results": [{"subagent_id": "round_eval_r2", "status": "completed", "answer": "ok", "workspace_path": "/tmp/fake"}]}

    async def _fake_mcp_call(*args, **kwargs):
        nonlocal mcp_called
        mcp_called = True
        return {"success": True, "results": []}

    orchestrator._direct_spawn_subagents = _fake_direct_spawn
    orchestrator._call_subagent_mcp_tool_async = _fake_mcp_call
    orchestrator._handle_round_evaluator_gate_failure = lambda **kw: False
    orchestrator._queue_round_start_context_block = lambda *a: None

    with patch("massgen.orchestrator.get_event_emitter", return_value=None):
        try:
            await orchestrator._run_round_evaluator_pre_round_if_needed(
                answers={agent_id: "some answer"},
            )
        except Exception:
            pass

    assert direct_called, "Direct spawn should be used even with filesystem_manager"
    assert not mcp_called, "MCP path should never be used for orchestrator-managed round evaluator"


# ---------------------------------------------------------------------------
# Part A: Trace analyzer context isolation
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Part C: Delegation targets exclude analytical subagent types
# ---------------------------------------------------------------------------


def test_delegate_targets_exclude_trace_analyzer(mock_orchestrator):
    """_get_parent_round_evaluator_delegate_targets must exclude
    execution_trace_analyzer (it's analytical, not a worker)."""
    from massgen.agent_config import AgentConfig, CoordinationConfig

    coord = CoordinationConfig(
        enable_subagents=True,
        subagent_types=["round_evaluator", "execution_trace_analyzer", "builder"],
    )
    config = AgentConfig(coordination_config=coord)
    orchestrator = mock_orchestrator(num_agents=1, config=config)

    targets = orchestrator._get_parent_round_evaluator_delegate_targets()
    target_names_lower = [t.lower() for t in targets]

    assert "round_evaluator" not in target_names_lower, "round_evaluator should be excluded from delegate targets"
    assert "execution_trace_analyzer" not in target_names_lower, "execution_trace_analyzer should be excluded from delegate targets"
    assert "builder" in target_names_lower, "Worker-type subagents (builder) should be included"


def test_execution_trace_analyzer_subagent_md_requires_artifact_and_strict_do_threshold():
    """Trace analyzer prompt should require an artifact file and conservative DO guidance."""
    from pathlib import Path

    subagent_md = Path(__file__).parent.parent / "subagent_types" / "execution_trace_analyzer" / "SUBAGENT.md"
    content = subagent_md.read_text(encoding="utf-8")
    lower = content.lower()

    assert "deliverable/" in content
    assert "authoritative" in lower
    assert "if you are not certain" in lower or "if the trace does not clearly prove it worked" in lower
    assert "do not promote it to `do`" in lower or "do not put it in `do`" in lower


# ---------------------------------------------------------------------------
# Part D: next_tasks.json validation robustness
# ---------------------------------------------------------------------------


def test_next_tasks_validation_accepts_missing_override_reason():
    """ceiling_approaching + incremental_refinement without
    incremental_override_reason should still be accepted (with warning)."""
    from massgen.subagent.models import RoundEvaluatorResult

    payload = {
        "success_contract": {
            "outcome_statement": "Improve the design",
            "quality_bar": "High quality",
            "fail_if_any": ["Missing key elements"],
            "required_evidence": ["Visual check"],
        },
        "strategy_mode": "incremental_refinement",
        "approach_assessment": {
            "ceiling_status": "ceiling_approaching",
        },
        # NOTE: no incremental_override_reason
        "tasks": [
            {
                "description": "Refine the layout",
                "verification": "Check alignment",
                "success_criteria": "Aligned properly",
                "failure_signals": ["Misalignment"],
                "required_evidence": ["Screenshot"],
            },
        ],
    }
    result = RoundEvaluatorResult.normalize_next_tasks_payload(payload)
    assert result is not None, "Payload with ceiling_approaching + incremental_refinement but no " "override_reason should be accepted (soft validation)"
    # Should have a default override reason filled in.
    assert result.get("incremental_override_reason"), "A default incremental_override_reason should be populated"
