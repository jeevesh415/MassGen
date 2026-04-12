"""
Tests for checkpoint coordination mode.

TDD: Tests written first, implementation follows.
Covers: checkpoint MCP server, proposed_actions on new_answer,
        orchestrator solo/checkpoint mode switching, gated patterns,
        and coordination tracker checkpoint events.
"""

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# ============================================================================
# Phase 1: Checkpoint MCP Server
# ============================================================================


class TestCheckpointToolParameters:
    """Test checkpoint tool parameter validation."""

    def test_checkpoint_tool_requires_task(self):
        """checkpoint() must require a task parameter."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            validate_checkpoint_params,
        )

        with pytest.raises(ValueError, match="task"):
            validate_checkpoint_params(task="", context="", eval_criteria=["Good"])

    def test_checkpoint_tool_accepts_minimal_params(self):
        """checkpoint() with just task and eval_criteria should be valid."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            validate_checkpoint_params,
        )

        result = validate_checkpoint_params(
            task="Build the auth system",
            eval_criteria=["Secure authentication"],
        )
        assert result["task"] == "Build the auth system"

    def test_checkpoint_tool_accepts_full_params(self):
        """checkpoint() with all params should be valid."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            validate_checkpoint_params,
        )

        gated_actions = [
            {"tool": "mcp__vercel__deploy", "description": "Deploy to Vercel"},
        ]
        result = validate_checkpoint_params(
            task="Build and deploy",
            context="Website is ready",
            eval_criteria=["Deploys correctly"],
            gated_actions=gated_actions,
        )
        assert result["task"] == "Build and deploy"
        assert result["context"] == "Website is ready"
        assert len(result["gated_actions"]) == 1
        assert result["gated_actions"][0]["tool"] == "mcp__vercel__deploy"

    def test_checkpoint_gated_actions_validates_tool_field(self):
        """Each gated_action must have a 'tool' field."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            validate_checkpoint_params,
        )

        with pytest.raises(ValueError, match="tool"):
            validate_checkpoint_params(
                task="Deploy",
                eval_criteria=["Works"],
                gated_actions=[{"description": "no tool field"}],
            )


class TestCheckpointSignal:
    """Test checkpoint signal generation for orchestrator."""

    def test_build_checkpoint_signal(self):
        """Checkpoint tool should produce a signal dict for the orchestrator."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            build_checkpoint_signal,
        )

        signal = build_checkpoint_signal(
            task="Build the frontend",
            context="We need React",
            eval_criteria=["Beautiful UI"],
            gated_actions=[
                {"tool": "mcp__vercel__deploy", "description": "Deploy"},
            ],
        )
        assert signal["type"] == "checkpoint"
        assert signal["task"] == "Build the frontend"
        assert signal["context"] == "We need React"
        assert len(signal["gated_actions"]) == 1
        # Backward compat
        assert len(signal["expected_actions"]) == 1

    def test_build_checkpoint_signal_minimal(self):
        """Checkpoint signal with minimal params."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            build_checkpoint_signal,
        )

        signal = build_checkpoint_signal(
            task="Review code",
            context="",
            eval_criteria=["Code quality"],
        )
        assert signal["type"] == "checkpoint"
        assert signal["task"] == "Review code"
        assert signal["context"] == ""
        assert signal["gated_actions"] == []
        assert signal["eval_criteria"] == ["Code quality"]

    def test_checkpoint_signal_written_to_file(self, tmp_path):
        """Checkpoint signal should be written to workspace for orchestrator detection."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            write_checkpoint_signal,
        )

        signal = {
            "type": "checkpoint",
            "task": "Build auth",
            "context": "",
            "expected_actions": [],
        }
        write_checkpoint_signal(signal, tmp_path)

        signal_file = tmp_path / ".massgen_checkpoint_signal.json"
        assert signal_file.exists()
        loaded = json.loads(signal_file.read_text())
        assert loaded["type"] == "checkpoint"
        assert loaded["task"] == "Build auth"


class TestCheckpointResult:
    """Test checkpoint result formatting."""

    def test_format_checkpoint_result(self):
        """Format checkpoint result for return to main agent."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            format_checkpoint_result,
        )

        result = format_checkpoint_result(
            consensus="Built the website with React",
            workspace_changes=[
                {"file": "src/App.tsx", "change": "created"},
            ],
            action_results=[
                {
                    "tool": "mcp__vercel__deploy",
                    "executed": True,
                    "result": {"url": "https://my-site.vercel.app"},
                },
            ],
        )
        assert result["consensus"] == "Built the website with React"
        assert len(result["workspace_changes"]) == 1
        assert len(result["action_results"]) == 1
        assert result["action_results"][0]["executed"] is True

    def test_format_checkpoint_result_no_actions(self):
        """Checkpoint result with no action results."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            format_checkpoint_result,
        )

        result = format_checkpoint_result(
            consensus="Chose PostgreSQL",
            workspace_changes=[],
            action_results=[],
        )
        assert result["consensus"] == "Chose PostgreSQL"
        assert result["workspace_changes"] == []
        assert result["action_results"] == []


# ============================================================================
# Phase 1: Subrun Utils - build_checkpoint_mcp_config
# ============================================================================


class TestBuildCheckpointMcpConfig:
    """Test checkpoint MCP config generation."""

    def test_build_checkpoint_mcp_config_basic(self):
        """Should generate MCP config for checkpoint server."""
        from massgen.mcp_tools.subrun_utils import build_checkpoint_mcp_config

        config = build_checkpoint_mcp_config(
            workspace_path=Path("/tmp/workspace"),
            agent_id="architect",
        )
        assert config["name"] == "massgen_checkpoint"
        assert "command" in config
        assert "--workspace-path" in str(config)
        assert "--agent-id" in str(config)

    def test_build_checkpoint_mcp_config_with_gated_patterns(self):
        """Should pass gated patterns to MCP config."""
        from massgen.mcp_tools.subrun_utils import build_checkpoint_mcp_config

        config = build_checkpoint_mcp_config(
            workspace_path=Path("/tmp/workspace"),
            agent_id="architect",
            gated_patterns=["mcp__vercel__deploy*"],
        )
        # Gated patterns should be encoded in args
        args_str = " ".join(config.get("args", []))
        assert "gated_patterns" in args_str or "--gated-patterns" in args_str


# ============================================================================
# Phase 2: Extended new_answer with proposed_actions
# ============================================================================


class TestNewAnswerProposedActions:
    """Test new_answer tool with proposed_actions extension."""

    def test_new_answer_default_no_proposed_actions(self):
        """Normal new_answer should NOT have proposed_actions param."""
        from massgen.tool.workflow_toolkits.new_answer import NewAnswerToolkit

        toolkit = NewAnswerToolkit()
        config = {"api_format": "chat_completions", "enable_workflow_tools": True}
        tools = toolkit.get_tools(config)
        assert len(tools) == 1
        tool_def = tools[0]

        # Get properties from the tool definition
        if "function" in tool_def:
            props = tool_def["function"]["parameters"]["properties"]
        else:
            props = tool_def["input_schema"]["properties"]

        assert "proposed_actions" not in props

    def test_new_answer_checkpoint_context_has_proposed_actions(self):
        """new_answer in checkpoint context should have proposed_actions param."""
        from massgen.tool.workflow_toolkits.new_answer import NewAnswerToolkit

        toolkit = NewAnswerToolkit()
        config = {
            "api_format": "chat_completions",
            "enable_workflow_tools": True,
            "checkpoint_context": True,
        }
        tools = toolkit.get_tools(config)
        assert len(tools) == 1
        tool_def = tools[0]

        props = tool_def["function"]["parameters"]["properties"]
        assert "proposed_actions" in props

    def test_new_answer_proposed_actions_claude_format(self):
        """proposed_actions should appear in Claude format when checkpoint context."""
        from massgen.tool.workflow_toolkits.new_answer import NewAnswerToolkit

        toolkit = NewAnswerToolkit()
        config = {
            "api_format": "claude",
            "enable_workflow_tools": True,
            "checkpoint_context": True,
        }
        tools = toolkit.get_tools(config)
        tool_def = tools[0]
        props = tool_def["input_schema"]["properties"]
        assert "proposed_actions" in props

    def test_new_answer_proposed_actions_response_format(self):
        """proposed_actions should appear in Response API format when checkpoint context."""
        from massgen.tool.workflow_toolkits.new_answer import NewAnswerToolkit

        toolkit = NewAnswerToolkit()
        config = {
            "api_format": "response",
            "enable_workflow_tools": True,
            "checkpoint_context": True,
        }
        tools = toolkit.get_tools(config)
        tool_def = tools[0]
        props = tool_def["function"]["parameters"]["properties"]
        assert "proposed_actions" in props


class TestWorkflowToolsCheckpointContext:
    """Test get_workflow_tools passes checkpoint context through."""

    def test_get_workflow_tools_with_checkpoint_context(self):
        """get_workflow_tools should pass checkpoint_context to new_answer toolkit."""
        from massgen.tool.workflow_toolkits import get_workflow_tools

        tools = get_workflow_tools(
            valid_agent_ids=["agent1", "agent2"],
            api_format="chat_completions",
            checkpoint_context=True,
        )
        # Find new_answer tool
        new_answer_tool = None
        for t in tools:
            name = t.get("name") or t.get("function", {}).get("name")
            if name == "new_answer":
                new_answer_tool = t
                break

        assert new_answer_tool is not None
        props = new_answer_tool["function"]["parameters"]["properties"]
        assert "proposed_actions" in props

    def test_get_workflow_tools_without_checkpoint_context(self):
        """get_workflow_tools without checkpoint_context should NOT have proposed_actions."""
        from massgen.tool.workflow_toolkits import get_workflow_tools

        tools = get_workflow_tools(
            valid_agent_ids=["agent1", "agent2"],
            api_format="chat_completions",
        )
        new_answer_tool = None
        for t in tools:
            name = t.get("name") or t.get("function", {}).get("name")
            if name == "new_answer":
                new_answer_tool = t
                break

        assert new_answer_tool is not None
        props = new_answer_tool["function"]["parameters"]["properties"]
        assert "proposed_actions" not in props


# ============================================================================
# Phase 4: Gated Pattern Enforcement
# ============================================================================


class TestCheckpointGatedHook:
    """Test CheckpointGatedHook for blocking gated tools."""

    def test_gated_hook_blocks_matching_tool(self):
        """Gated hook should block tools matching gated_patterns."""
        from massgen.mcp_tools.hooks import CheckpointGatedHook, HookEvent

        hook = CheckpointGatedHook(
            gated_patterns=["mcp__vercel__deploy*", "mcp__github__delete_*"],
        )
        event = HookEvent(
            hook_type="PreToolUse",
            session_id="test",
            orchestrator_id="orch",
            agent_id="agent1",
            timestamp=MagicMock(),
            tool_name="mcp__vercel__deploy_production",
            tool_input={},
        )
        result = hook(event)
        assert result.decision == "deny"
        assert "checkpoint" in result.reason.lower() or "proposed_action" in result.reason.lower()

    def test_gated_hook_allows_non_matching_tool(self):
        """Gated hook should allow tools NOT matching gated_patterns."""
        from massgen.mcp_tools.hooks import CheckpointGatedHook, HookEvent

        hook = CheckpointGatedHook(
            gated_patterns=["mcp__vercel__deploy*"],
        )
        event = HookEvent(
            hook_type="PreToolUse",
            session_id="test",
            orchestrator_id="orch",
            agent_id="agent1",
            timestamp=MagicMock(),
            tool_name="mcp__github__read_file",
            tool_input={},
        )
        result = hook(event)
        assert result.decision == "allow"

    def test_gated_hook_uses_fnmatch(self):
        """Gated patterns should use fnmatch syntax."""
        from massgen.mcp_tools.hooks import CheckpointGatedHook, HookEvent

        hook = CheckpointGatedHook(
            gated_patterns=["mcp__*__production_*"],
        )
        # Should match
        event_match = HookEvent(
            hook_type="PreToolUse",
            session_id="test",
            orchestrator_id="orch",
            agent_id="agent1",
            timestamp=MagicMock(),
            tool_name="mcp__aws__production_deploy",
            tool_input={},
        )
        result = hook(event_match)
        assert result.decision == "deny"

        # Should not match
        event_no_match = HookEvent(
            hook_type="PreToolUse",
            session_id="test",
            orchestrator_id="orch",
            agent_id="agent1",
            timestamp=MagicMock(),
            tool_name="mcp__aws__staging_deploy",
            tool_input={},
        )
        result = hook(event_no_match)
        assert result.decision == "allow"

    def test_gated_hook_empty_patterns_allows_all(self):
        """Empty gated_patterns should allow all tools."""
        from massgen.mcp_tools.hooks import CheckpointGatedHook, HookEvent

        hook = CheckpointGatedHook(gated_patterns=[])
        event = HookEvent(
            hook_type="PreToolUse",
            session_id="test",
            orchestrator_id="orch",
            agent_id="agent1",
            timestamp=MagicMock(),
            tool_name="mcp__vercel__deploy",
            tool_input={},
        )
        result = hook(event)
        assert result.decision == "allow"


# ============================================================================
# Phase 4: Coordination Tracker Checkpoint Events
# ============================================================================


class TestCoordinationTrackerCheckpointEvents:
    """Test checkpoint event types in coordination tracker."""

    def test_checkpoint_event_types_exist(self):
        """Checkpoint event types should be defined."""
        from massgen.coordination_tracker import EventType

        assert hasattr(EventType, "CHECKPOINT_CALLED")
        assert hasattr(EventType, "CHECKPOINT_AGENTS_ACTIVATED")
        assert hasattr(EventType, "CHECKPOINT_CONSENSUS_REACHED")
        assert hasattr(EventType, "CHECKPOINT_ACTION_EXECUTED")
        assert hasattr(EventType, "CHECKPOINT_ACTION_FAILED")
        assert hasattr(EventType, "CHECKPOINT_COMPLETED")

    def test_tracker_records_checkpoint_event(self):
        """Tracker should record checkpoint events."""
        from massgen.coordination_tracker import (
            CoordinationTracker,
            EventType,
        )

        tracker = CoordinationTracker()
        tracker._add_event(
            EventType.CHECKPOINT_CALLED,
            agent_id="architect",
            details="Delegating: Build the frontend",
        )
        events = [e for e in tracker.events if e.event_type == EventType.CHECKPOINT_CALLED]
        assert len(events) == 1
        assert events[0].agent_id == "architect"


# ============================================================================
# Phase 3: Config Validation
# ============================================================================


class TestCheckpointConfigValidation:
    """Test checkpoint config validation."""

    def test_valid_checkpoint_config(self):
        """Valid checkpoint config should pass validation."""
        from massgen.config_validator import ConfigValidator

        validator = ConfigValidator()
        config = {
            "agents": [
                {
                    "id": "architect",
                    "main_agent": True,
                    "backend": {"type": "claude", "model": "claude-sonnet-4-20250514"},
                },
                {
                    "id": "builder",
                    "backend": {"type": "claude", "model": "claude-sonnet-4-20250514"},
                },
            ],
            "checkpoint": {
                "enabled": True,
                "mode": "conversation",
            },
        }
        result = validator.validate_config(config)
        # Should not have errors related to checkpoint
        checkpoint_errors = [e for e in result.errors if "checkpoint" in e.message.lower() or "main_agent" in e.message.lower()]
        assert len(checkpoint_errors) == 0

    def test_multiple_main_agents_rejected(self):
        """Multiple main_agent: true should be rejected."""
        from massgen.config_validator import ConfigValidator

        validator = ConfigValidator()
        config = {
            "agents": [
                {
                    "id": "agent1",
                    "main_agent": True,
                    "backend": {"type": "claude", "model": "claude-sonnet-4-20250514"},
                },
                {
                    "id": "agent2",
                    "main_agent": True,
                    "backend": {"type": "claude", "model": "claude-sonnet-4-20250514"},
                },
            ],
        }
        result = validator.validate_config(config)
        main_agent_errors = [e for e in result.errors if "main_agent" in e.message.lower()]
        assert len(main_agent_errors) > 0

    def test_invalid_checkpoint_mode(self):
        """Invalid checkpoint mode should produce a warning or error."""
        from massgen.config_validator import ConfigValidator

        validator = ConfigValidator()
        config = {
            "agents": [
                {
                    "id": "agent1",
                    "main_agent": True,
                    "backend": {"type": "claude", "model": "claude-sonnet-4-20250514"},
                },
                {
                    "id": "agent2",
                    "backend": {"type": "claude", "model": "claude-sonnet-4-20250514"},
                },
            ],
            "checkpoint": {
                "enabled": True,
                "mode": "invalid_mode",
            },
        }
        result = validator.validate_config(config)
        mode_errors = [e for e in result.errors if "mode" in e.message.lower() and "checkpoint" in e.location.lower()]
        assert len(mode_errors) > 0


# ============================================================================
# Phase 3: Agent Config - Checkpoint Fields
# ============================================================================


class TestCheckpointAgentConfig:
    """Test checkpoint fields in CoordinationConfig."""

    def test_coordination_config_has_checkpoint_fields(self):
        """CoordinationConfig should have checkpoint-related fields."""
        from massgen.agent_config import CoordinationConfig

        config = CoordinationConfig()
        assert hasattr(config, "checkpoint_enabled")
        assert hasattr(config, "checkpoint_mode")
        assert hasattr(config, "checkpoint_guidance")
        assert hasattr(config, "checkpoint_gated_patterns")

    def test_coordination_config_checkpoint_defaults(self):
        """Checkpoint fields should have sensible defaults."""
        from massgen.agent_config import CoordinationConfig

        config = CoordinationConfig()
        assert config.checkpoint_enabled is False
        assert config.checkpoint_mode == "conversation"
        assert config.checkpoint_guidance == ""
        assert config.checkpoint_gated_patterns == []


class TestCheckpointCliParsing:
    """Test CLI parsing of checkpoint config."""

    def test_parse_coordination_config_with_checkpoint(self):
        """_parse_coordination_config should handle checkpoint fields."""
        from massgen.cli import _parse_coordination_config

        coord_cfg = {
            "checkpoint_enabled": True,
            "checkpoint_mode": "task",
            "checkpoint_guidance": "Break complex tasks into checkpoints.",
            "checkpoint_gated_patterns": ["mcp__vercel__deploy*"],
        }
        config = _parse_coordination_config(coord_cfg)
        assert config.checkpoint_enabled is True
        assert config.checkpoint_mode == "task"
        assert config.checkpoint_guidance == "Break complex tasks into checkpoints."
        assert config.checkpoint_gated_patterns == ["mcp__vercel__deploy*"]

    def test_parse_coordination_config_checkpoint_defaults(self):
        """Missing checkpoint fields should use defaults."""
        from massgen.cli import _parse_coordination_config

        coord_cfg = {}
        config = _parse_coordination_config(coord_cfg)
        assert config.checkpoint_enabled is False
        assert config.checkpoint_mode == "conversation"


# ============================================================================
# Phase 3: Backend Exclusions
# ============================================================================


class TestBackendExclusions:
    """Test that checkpoint params are excluded from API calls."""

    def test_main_agent_excluded_from_api_params(self):
        """main_agent should be in excluded params."""
        from massgen.backend.base import LLMBackend

        excluded = LLMBackend.get_base_excluded_config_params()
        assert "main_agent" in excluded

    def test_checkpoint_params_excluded(self):
        """Checkpoint-related params should be excluded from API calls."""
        from massgen.backend.base import LLMBackend

        excluded = LLMBackend.get_base_excluded_config_params()
        assert "checkpoint_enabled" in excluded
        assert "checkpoint_mode" in excluded
        assert "checkpoint_guidance" in excluded
        assert "checkpoint_gated_patterns" in excluded

    def test_api_handler_excludes_checkpoint_params(self):
        """API params handler should also exclude checkpoint params."""
        # APIParamsHandlerBase is abstract, but we can check the method exists
        # and the set contains checkpoint params via a concrete subclass
        from unittest.mock import MagicMock

        from massgen.api_params_handler._api_params_handler_base import (
            APIParamsHandlerBase,
        )

        handler = MagicMock(spec=APIParamsHandlerBase)
        handler.get_base_excluded_params = APIParamsHandlerBase.get_base_excluded_params
        excluded = handler.get_base_excluded_params(handler)
        assert "main_agent" in excluded
        assert "checkpoint_enabled" in excluded


# ============================================================================
# Phase 1: FRAMEWORK_MCPS
# ============================================================================


class TestFrameworkMcps:
    """Test that checkpoint is in FRAMEWORK_MCPS."""

    def test_checkpoint_in_framework_mcps(self):
        """massgen_checkpoint should be in FRAMEWORK_MCPS."""
        from massgen.filesystem_manager._constants import FRAMEWORK_MCPS

        assert "massgen_checkpoint" in FRAMEWORK_MCPS


# ============================================================================
# Phase 4b: Checkpoint Tool Schema — eval_criteria, personas, gated_actions
# ============================================================================


class TestCheckpointToolEvalCriteria:
    """Test that checkpoint tool requires eval_criteria and accepts personas."""

    def test_validate_requires_eval_criteria(self):
        """eval_criteria is required and must be non-empty."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            validate_checkpoint_params,
        )

        with pytest.raises(ValueError, match="eval_criteria"):
            validate_checkpoint_params(
                task="Build a website",
                context="",
                eval_criteria=[],
            )

    def test_validate_accepts_eval_criteria(self):
        """eval_criteria as list of strings should be accepted."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            validate_checkpoint_params,
        )

        result = validate_checkpoint_params(
            task="Build a website",
            eval_criteria=["Beautiful design", "Responsive layout"],
        )
        assert result["eval_criteria"] == ["Beautiful design", "Responsive layout"]

    def test_validate_accepts_personas(self):
        """personas as dict of agent_id -> persona text should be accepted."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            validate_checkpoint_params,
        )

        result = validate_checkpoint_params(
            task="Build a website",
            eval_criteria=["Good design"],
            personas={
                "agent_a": "You are a frontend expert who values clean code.",
                "agent_b": "You are a UX designer focused on accessibility.",
            },
        )
        assert "agent_a" in result["personas"]
        assert "agent_b" in result["personas"]

    def test_validate_personas_optional(self):
        """personas should default to empty dict when not provided."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            validate_checkpoint_params,
        )

        result = validate_checkpoint_params(
            task="Build a website",
            eval_criteria=["Good design"],
        )
        assert result["personas"] == {}

    def test_validate_gated_actions_replaces_expected_actions(self):
        """gated_actions should be the field name, not expected_actions."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            validate_checkpoint_params,
        )

        result = validate_checkpoint_params(
            task="Deploy site",
            eval_criteria=["Deploys correctly"],
            gated_actions=[
                {"tool": "mcp__vercel__deploy", "description": "Deploy to Vercel"},
            ],
        )
        assert len(result["gated_actions"]) == 1
        assert result["gated_actions"][0]["tool"] == "mcp__vercel__deploy"

    def test_validate_gated_actions_optional(self):
        """gated_actions should default to empty list."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            validate_checkpoint_params,
        )

        result = validate_checkpoint_params(
            task="Build site",
            eval_criteria=["Good design"],
        )
        assert result["gated_actions"] == []


class TestCheckpointSignalWithNewParams:
    """Test checkpoint signal includes eval_criteria and personas."""

    def test_signal_includes_eval_criteria(self):
        """Signal should carry eval_criteria through to orchestrator."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            build_checkpoint_signal,
        )

        signal = build_checkpoint_signal(
            task="Build site",
            eval_criteria=["Beautiful", "Responsive"],
        )
        assert signal["eval_criteria"] == ["Beautiful", "Responsive"]

    def test_signal_includes_personas(self):
        """Signal should carry personas through to orchestrator."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            build_checkpoint_signal,
        )

        signal = build_checkpoint_signal(
            task="Build site",
            eval_criteria=["Good"],
            personas={"agent_a": "Frontend expert"},
        )
        assert signal["personas"] == {"agent_a": "Frontend expert"}

    def test_signal_uses_gated_actions(self):
        """Signal should use gated_actions, not expected_actions."""
        from massgen.mcp_tools.checkpoint._checkpoint_mcp_server import (
            build_checkpoint_signal,
        )

        signal = build_checkpoint_signal(
            task="Deploy",
            eval_criteria=["Works"],
            gated_actions=[{"tool": "deploy", "description": "Deploy"}],
        )
        assert "gated_actions" in signal
        assert len(signal["gated_actions"]) == 1
        # expected_actions should still exist for backward compat
        assert "expected_actions" in signal


class TestCheckpointToolkitSchema:
    """Test that the workflow toolkit schema includes new params."""

    def test_checkpoint_tool_has_eval_criteria(self):
        """Checkpoint tool schema should have eval_criteria as required param."""
        from massgen.tool.workflow_toolkits.checkpoint import CheckpointToolkit

        toolkit = CheckpointToolkit()
        config = {"api_format": "chat_completions", "checkpoint_mode": True}
        tools = toolkit.get_tools(config)
        assert len(tools) == 1

        props = tools[0]["function"]["parameters"]["properties"]
        assert "eval_criteria" in props
        required = tools[0]["function"]["parameters"]["required"]
        assert "eval_criteria" in required

    def test_checkpoint_tool_has_personas(self):
        """Checkpoint tool schema should have personas as optional param."""
        from massgen.tool.workflow_toolkits.checkpoint import CheckpointToolkit

        toolkit = CheckpointToolkit()
        config = {"api_format": "chat_completions", "checkpoint_mode": True}
        tools = toolkit.get_tools(config)
        props = tools[0]["function"]["parameters"]["properties"]
        assert "personas" in props

    def test_checkpoint_tool_has_gated_actions(self):
        """Checkpoint tool schema should have gated_actions, not expected_actions."""
        from massgen.tool.workflow_toolkits.checkpoint import CheckpointToolkit

        toolkit = CheckpointToolkit()
        config = {"api_format": "chat_completions", "checkpoint_mode": True}
        tools = toolkit.get_tools(config)
        props = tools[0]["function"]["parameters"]["properties"]
        assert "gated_actions" in props
        assert "expected_actions" not in props


class TestAgentOutputWriterCheckpoint:
    """Test AgentOutputWriter handles checkpoint_activated events."""

    def test_checkpoint_activated_creates_participant_files(self, tmp_path):
        """checkpoint_activated event should create output files for participants."""
        from massgen.events import MassGenEvent
        from massgen.frontend.agent_output_writer import AgentOutputWriter

        writer = AgentOutputWriter(tmp_path, ["agent_a", "agent_b"])
        event = MassGenEvent(
            timestamp="2026-01-01T00:00:00",
            event_type="checkpoint_activated",
            data={
                "checkpoint_number": 1,
                "main_agent_id": "agent_a",
                "participants": {
                    "agent_a-ckpt1": {"real_agent_id": "agent_a", "model": "claude"},
                    "agent_b": {"real_agent_id": "agent_b", "model": "gpt-4o"},
                },
            },
        )
        writer.handle_event(event)

        # main.txt should exist (copied from agent_a.txt)
        assert (tmp_path / "main.txt").exists()
        main_content = (tmp_path / "main.txt").read_text()
        assert "AGENT_A OUTPUT LOG" in main_content
        assert "CHECKPOINT #1 DELEGATED" in main_content

        # Participant files should exist
        assert (tmp_path / "agent_a-ckpt1.txt").exists()
        ckpt_content = (tmp_path / "agent_a-ckpt1.txt").read_text()
        assert "AGENT_A-CKPT1" in ckpt_content

    def test_checkpoint_participant_events_write_to_new_files(self, tmp_path):
        """Events with checkpoint display IDs should write to participant files."""
        from massgen.events import MassGenEvent
        from massgen.frontend.agent_output_writer import AgentOutputWriter

        writer = AgentOutputWriter(tmp_path, ["agent_a", "agent_b"])

        # Activate checkpoint
        writer.handle_event(
            MassGenEvent(
                timestamp="2026-01-01T00:00:00",
                event_type="checkpoint_activated",
                data={
                    "checkpoint_number": 1,
                    "main_agent_id": "agent_a",
                    "participants": {
                        "agent_a-ckpt1": {"real_agent_id": "agent_a", "model": ""},
                        "agent_b": {"real_agent_id": "agent_b", "model": ""},
                    },
                },
            ),
        )

        # Send a text event for the checkpoint participant
        writer.handle_event(
            MassGenEvent(
                timestamp="2026-01-01T00:00:01",
                event_type="text",
                agent_id="agent_a-ckpt1",
                data={"content": "Working on checkpoint task..."},
            ),
        )

        ckpt_content = (tmp_path / "agent_a-ckpt1.txt").read_text()
        assert "Working on checkpoint task..." in ckpt_content

    def test_pre_checkpoint_main_output_not_in_participant_file(self, tmp_path):
        """Pre-checkpoint main agent output should be in main.txt, not the ckpt file."""
        from massgen.events import MassGenEvent
        from massgen.frontend.agent_output_writer import AgentOutputWriter

        writer = AgentOutputWriter(tmp_path, ["agent_a", "agent_b"])

        # Pre-checkpoint output
        writer.handle_event(
            MassGenEvent(
                timestamp="2026-01-01T00:00:00",
                event_type="text",
                agent_id="agent_a",
                data={"content": "Planning the task..."},
            ),
        )

        # Activate checkpoint
        writer.handle_event(
            MassGenEvent(
                timestamp="2026-01-01T00:00:01",
                event_type="checkpoint_activated",
                data={
                    "checkpoint_number": 1,
                    "main_agent_id": "agent_a",
                    "participants": {
                        "agent_a-ckpt1": {"real_agent_id": "agent_a", "model": ""},
                        "agent_b": {"real_agent_id": "agent_b", "model": ""},
                    },
                },
            ),
        )

        # main.txt should have the pre-checkpoint content
        main_content = (tmp_path / "main.txt").read_text()
        assert "Planning the task..." in main_content

        # ckpt file should NOT have pre-checkpoint content
        ckpt_content = (tmp_path / "agent_a-ckpt1.txt").read_text()
        assert "Planning the task..." not in ckpt_content


class TestCheckpointRejectionGuard:
    """Test that checkpoint tool calls are rejected during active checkpoint."""

    def test_checkpoint_workflow_tools_excluded_during_checkpoint(self):
        """During active checkpoint, main agent should NOT get checkpoint workflow tools."""
        from unittest.mock import MagicMock

        from massgen.agent_config import AgentConfig
        from massgen.orchestrator import Orchestrator

        mock_backend = MagicMock()
        mock_backend.get_model_name.return_value = "claude-sonnet-4"
        mock_backend.filesystem_manager = None
        mock_backend.config = {"mcp_servers": {}}

        agent = MagicMock()
        agent.backend = mock_backend

        agents = {"agent_a": agent, "agent_b": MagicMock()}
        agents["agent_b"].backend = MagicMock()
        agents["agent_b"].backend.filesystem_manager = None
        agents["agent_b"].backend.config = {"mcp_servers": {}}
        agents["agent_b"].backend.get_model_name.return_value = "gpt-4o"

        config = AgentConfig.create_openai_config()
        orch = Orchestrator(
            orchestrator_id="orch",
            agents=agents,
            config=config,
        )
        orch._main_agent_id = "agent_a"

        # In solo mode (not checkpoint active), main agent gets checkpoint tools
        assert orch.is_checkpoint_mode is True
        assert orch._checkpoint_active is False

        # During checkpoint, is_checkpoint_mode is True and _checkpoint_active is True
        # The workflow tool selection logic at line 14172 should NOT give checkpoint tools
        orch._checkpoint_active = True
        # When checkpoint is active, the condition:
        # if self.is_checkpoint_mode and not self._checkpoint_active and agent_id == self._main_agent_id
        # evaluates to False, so agent gets regular workflow_tools, not checkpoint tools
        should_get_checkpoint_tools = orch.is_checkpoint_mode and not orch._checkpoint_active and "agent_a" == orch._main_agent_id
        assert should_get_checkpoint_tools is False


class TestStreamChunkCheckpointFields:
    """Test StreamChunk has fields for checkpoint events."""

    def test_stream_chunk_has_checkpoint_fields(self):
        """StreamChunk should support checkpoint_participants, checkpoint_number, main_agent_id."""
        from massgen.backend.base import StreamChunk

        chunk = StreamChunk(
            type="checkpoint_activated",
            content="Build a website",
            source="orchestrator",
            checkpoint_participants={"agent_a-ckpt1": {"real_agent_id": "agent_a"}},
            checkpoint_number=1,
            main_agent_id="agent_a",
        )
        assert chunk.checkpoint_participants is not None
        assert chunk.checkpoint_number == 1
        assert chunk.main_agent_id == "agent_a"

    def test_stream_chunk_checkpoint_fields_default_none(self):
        """Checkpoint fields should default to None."""
        from massgen.backend.base import StreamChunk

        chunk = StreamChunk(type="content", content="hello")
        assert chunk.checkpoint_participants is None
        assert chunk.checkpoint_number is None
        assert chunk.main_agent_id is None


# ============================================================================
# Phase: Checkpoint Subprocess Config Generation
# ============================================================================


class TestGenerateCheckpointConfig:
    """Test checkpoint-specific subprocess config generation."""

    def test_generates_valid_config_from_parent(self, tmp_path):
        """generate_checkpoint_config() should produce a runnable config."""
        from massgen.mcp_tools.subrun_utils import generate_checkpoint_config

        parent_config = {
            "agents": [
                {
                    "id": "agent_a",
                    "main_agent": True,
                    "backend": {
                        "type": "claude",
                        "model": "claude-sonnet-4-20250514",
                        "mcp_servers": [
                            {"name": "massgen_checkpoint", "transport": "stdio"},
                        ],
                    },
                },
                {
                    "id": "agent_b",
                    "backend": {
                        "type": "claude",
                        "model": "claude-sonnet-4-20250514",
                    },
                },
            ],
            "orchestrator": {
                "coordination": {
                    "checkpoint_enabled": True,
                },
            },
        }

        signal = {
            "task": "Build the frontend",
            "eval_criteria": ["Beautiful UI", "Responsive design"],
            "personas": {"agent_a": "Senior designer", "agent_b": "UX expert"},
        }

        config = generate_checkpoint_config(
            parent_config=parent_config,
            workspace=tmp_path,
            signal=signal,
        )

        # All agents participate equally (no main_agent flag)
        for agent in config["agents"]:
            assert "main_agent" not in agent

        # checkpoint_enabled must be false to prevent recursion
        coord = config["orchestrator"].get("coordination", {})
        assert coord.get("checkpoint_enabled") is False

    def test_injects_eval_criteria_as_checklist(self, tmp_path):
        """Eval criteria from signal should become inline checklist criteria."""
        from massgen.mcp_tools.subrun_utils import generate_checkpoint_config

        parent_config = {
            "agents": [
                {"id": "agent_a", "backend": {"type": "claude"}},
            ],
            "orchestrator": {},
        }
        signal = {
            "task": "Review code",
            "eval_criteria": ["Correct logic", "Clean style"],
        }

        config = generate_checkpoint_config(
            parent_config=parent_config,
            workspace=tmp_path,
            signal=signal,
        )

        coord = config["orchestrator"].get("coordination", {})
        assert coord.get("evaluation_mode") == "checklist_gated"
        criteria = coord.get("inline_checklist_criteria", [])
        assert "Correct logic" in criteria
        assert "Clean style" in criteria

    def test_injects_personas(self, tmp_path):
        """Personas from signal should be injected into agent configs."""
        from massgen.mcp_tools.subrun_utils import generate_checkpoint_config

        parent_config = {
            "agents": [
                {"id": "agent_a", "backend": {"type": "claude"}},
                {"id": "agent_b", "backend": {"type": "claude"}},
            ],
            "orchestrator": {},
        }
        signal = {
            "task": "Design API",
            "eval_criteria": ["RESTful"],
            "personas": {
                "agent_a": "Backend architect",
                "agent_b": "API security expert",
            },
        }

        config = generate_checkpoint_config(
            parent_config=parent_config,
            workspace=tmp_path,
            signal=signal,
        )

        agent_map = {a["id"]: a for a in config["agents"]}
        assert agent_map["agent_a"].get("persona") == "Backend architect"
        assert agent_map["agent_b"].get("persona") == "API security expert"

    def test_removes_checkpoint_mcp_servers(self, tmp_path):
        """Checkpoint and gated_action MCP servers should be excluded."""
        from massgen.mcp_tools.subrun_utils import generate_checkpoint_config

        parent_config = {
            "agents": [
                {
                    "id": "agent_a",
                    "backend": {
                        "type": "claude",
                        "mcp_servers": [
                            {"name": "massgen_checkpoint", "transport": "stdio"},
                            {"name": "filesystem", "transport": "stdio"},
                        ],
                    },
                },
            ],
            "orchestrator": {},
        }
        signal = {"task": "Test", "eval_criteria": ["Works"]}

        config = generate_checkpoint_config(
            parent_config=parent_config,
            workspace=tmp_path,
            signal=signal,
        )

        mcp_names = [s.get("name") for s in config["agents"][0]["backend"].get("mcp_servers", [])]
        assert "massgen_checkpoint" not in mcp_names
        assert "filesystem" in mcp_names

    def test_empty_personas_no_persona_field(self, tmp_path):
        """When signal has no personas, agent configs should not get persona field."""
        from massgen.mcp_tools.subrun_utils import generate_checkpoint_config

        parent_config = {
            "agents": [{"id": "agent_a", "backend": {"type": "claude"}}],
            "orchestrator": {},
        }
        signal = {"task": "Test", "eval_criteria": ["Works"], "personas": {}}

        config = generate_checkpoint_config(
            parent_config=parent_config,
            workspace=tmp_path,
            signal=signal,
        )

        assert "persona" not in config["agents"][0]


# ============================================================================
# Phase: Checkpoint Subprocess Manager
# ============================================================================


class TestCheckpointSubprocessManager:
    """Test CheckpointSubprocessManager lifecycle."""

    def test_build_command_includes_stream_events(self, tmp_path):
        """Subprocess command should include --stream-events for event relay."""
        from massgen.mcp_tools.checkpoint._subprocess_manager import (
            CheckpointSubprocessManager,
        )

        mgr = CheckpointSubprocessManager(
            parent_config={"agents": [{"id": "a", "backend": {"type": "claude"}}]},
            parent_workspace=tmp_path,
            checkpoint_number=1,
        )
        yaml_path = tmp_path / "ckpt.yaml"
        yaml_path.write_text("agents: []")
        answer_file = tmp_path / "answer.txt"

        cmd = mgr._build_command(
            config_path=yaml_path,
            answer_file=answer_file,
            task="Build it",
        )
        assert "--stream-events" in cmd
        assert "--automation" not in cmd  # --stream-events implies --automation
        assert "Build it" in cmd

    def test_remap_agent_id(self):
        """Event agent IDs should be remapped with checkpoint suffix."""
        from massgen.mcp_tools.checkpoint._subprocess_manager import (
            CheckpointSubprocessManager,
        )

        mgr = CheckpointSubprocessManager(
            parent_config={"agents": [{"id": "a", "backend": {"type": "claude"}}]},
            parent_workspace="/tmp/test",
            checkpoint_number=2,
        )

        assert mgr._remap_agent_id("agent_a") == "agent_a-ckpt2"
        assert mgr._remap_agent_id("agent_b") == "agent_b-ckpt2"
        # None stays None
        assert mgr._remap_agent_id(None) is None

    def test_generates_workspace_path(self, tmp_path):
        """Manager should create a checkpoint workspace directory."""
        from massgen.mcp_tools.checkpoint._subprocess_manager import (
            CheckpointSubprocessManager,
        )

        mgr = CheckpointSubprocessManager(
            parent_config={"agents": [{"id": "a", "backend": {"type": "claude"}}]},
            parent_workspace=tmp_path,
            checkpoint_number=1,
        )

        ws = mgr._create_checkpoint_workspace()
        assert ws.exists()
        assert "ckpt_1" in ws.name


# ============================================================================
# Phase: Checkpoint-aware Task Planning
# ============================================================================


class TestCheckpointExecutionMode:
    """Test checkpoint as a task execution mode in the planning system."""

    def test_normalize_accepts_checkpoint_mode(self):
        """normalize_task_execution() should accept mode='checkpoint'."""
        from massgen.mcp_tools.planning.planning_dataclasses import (
            normalize_task_execution,
        )

        result = normalize_task_execution({"mode": "checkpoint"})
        assert result["mode"] == "checkpoint"

    def test_normalize_checkpoint_preserves_eval_criteria(self):
        """Checkpoint mode should preserve eval_criteria in metadata."""
        from massgen.mcp_tools.planning.planning_dataclasses import (
            normalize_task_execution,
        )

        result = normalize_task_execution(
            {
                "mode": "checkpoint",
                "eval_criteria": ["Clean code", "Tests pass"],
            },
        )
        assert result["mode"] == "checkpoint"
        assert result["eval_criteria"] == ["Clean code", "Tests pass"]

    def test_normalize_checkpoint_preserves_context(self):
        """Checkpoint mode should preserve context and personas."""
        from massgen.mcp_tools.planning.planning_dataclasses import (
            normalize_task_execution,
        )

        result = normalize_task_execution(
            {
                "mode": "checkpoint",
                "eval_criteria": ["Good"],
                "context": "Background info",
                "personas": {"agent_a": "Designer"},
            },
        )
        assert result["context"] == "Background info"
        assert result["personas"] == {"agent_a": "Designer"}

    def test_normalize_checkpoint_no_subagent_fields(self):
        """Checkpoint mode should not require subagent_type or subagent_id."""
        from massgen.mcp_tools.planning.planning_dataclasses import (
            normalize_task_execution,
        )

        # Should not raise
        result = normalize_task_execution({"mode": "checkpoint"})
        assert "subagent_type" not in result
        assert "subagent_id" not in result

    def test_task_roundtrip_with_checkpoint_execution(self):
        """Task with checkpoint execution should serialize/deserialize."""
        from massgen.mcp_tools.planning.planning_dataclasses import Task

        task = Task(
            id="t1",
            description="Design the API",
            metadata={
                "execution": {
                    "mode": "checkpoint",
                    "eval_criteria": ["RESTful", "Secure"],
                },
            },
        )
        data = task.to_dict()
        restored = Task.from_dict(data)
        exec_meta = restored.metadata.get("execution", {})
        assert exec_meta["mode"] == "checkpoint"
        assert exec_meta["eval_criteria"] == ["RESTful", "Secure"]


class TestTaskPlanningCheckpointGuidance:
    """Test that TaskPlanningSection includes checkpoint guidance."""

    def test_checkpoint_guidance_present_when_enabled(self):
        """TaskPlanningSection should mention checkpoint when checkpoint_mode=True."""
        from massgen.system_prompt_sections import TaskPlanningSection

        section = TaskPlanningSection(checkpoint_mode=True)
        content = section.build_content()
        assert "checkpoint" in content.lower()

    def test_checkpoint_guidance_absent_when_disabled(self):
        """TaskPlanningSection should not mention checkpoint execution when disabled."""
        from massgen.system_prompt_sections import TaskPlanningSection

        section = TaskPlanningSection(checkpoint_mode=False)
        content = section.build_content()
        # Should not mention checkpoint as an execution mode
        assert '"mode": "checkpoint"' not in content
