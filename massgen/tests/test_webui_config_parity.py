"""Tests for WebUI config parity with CLI.

Verifies that the WebUI's run_coordination() path uses the canonical
_parse_coordination_config() and _apply_orchestrator_runtime_params()
helpers, and that CLI flags are forwarded through run_server().
"""

from __future__ import annotations

import json

from massgen.cli import (
    _apply_orchestrator_runtime_params,
    _parse_coordination_config,
)

# ---------------------------------------------------------------------------
# Step 1: _parse_coordination_config handles all fields the WebUI needs
# ---------------------------------------------------------------------------


class TestParseCoordinationConfigParity:
    """Ensure _parse_coordination_config returns all fields the WebUI formerly
    constructed by hand, plus the many fields it was missing."""

    def test_evaluation_criteria_generator_parsed(self):
        coord_cfg = {
            "evaluation_criteria_generator": {
                "enabled": True,
                "min_criteria": 5,
                "max_criteria": 12,
            },
        }
        config = _parse_coordination_config(coord_cfg)
        assert config.evaluation_criteria_generator.enabled is True
        assert config.evaluation_criteria_generator.min_criteria == 5
        assert config.evaluation_criteria_generator.max_criteria == 12

    def test_prompt_improver_parsed(self):
        coord_cfg = {
            "prompt_improver": {
                "enabled": True,
                "persist_across_turns": True,
            },
        }
        config = _parse_coordination_config(coord_cfg)
        assert config.prompt_improver.enabled is True
        assert config.prompt_improver.persist_across_turns is True

    def test_task_decomposer_parsed(self):
        coord_cfg = {
            "task_decomposer": {
                "enabled": True,
                "timeout_seconds": 120,
            },
        }
        config = _parse_coordination_config(coord_cfg)
        assert config.task_decomposer.enabled is True
        assert config.task_decomposer.timeout_seconds == 120

    def test_checklist_criteria_inline_parsed(self):
        criteria = [{"text": "test criterion", "category": "must"}]
        coord_cfg = {"checklist_criteria_inline": criteria}
        config = _parse_coordination_config(coord_cfg)
        assert config.checklist_criteria_inline == criteria

    def test_checklist_criteria_preset_parsed(self):
        coord_cfg = {"checklist_criteria_preset": "evaluation"}
        config = _parse_coordination_config(coord_cfg)
        assert config.checklist_criteria_preset == "evaluation"

    def test_round_evaluator_fields_parsed(self):
        coord_cfg = {
            "round_evaluator_before_checklist": True,
            "orchestrator_managed_round_evaluator": True,
            "round_evaluator_skip_synthesis": True,
            "round_evaluator_refine": True,
            "round_evaluator_transformation_pressure": "aggressive",
        }
        config = _parse_coordination_config(coord_cfg)
        assert config.round_evaluator_before_checklist is True
        assert config.orchestrator_managed_round_evaluator is True
        assert config.round_evaluator_skip_synthesis is True
        assert config.round_evaluator_refine is True
        assert config.round_evaluator_transformation_pressure == "aggressive"

    def test_subagent_fields_parsed(self):
        coord_cfg = {
            "enable_subagents": True,
            "subagent_default_timeout": 600,
            "subagent_max_concurrent": 5,
        }
        config = _parse_coordination_config(coord_cfg)
        assert config.enable_subagents is True
        assert config.subagent_default_timeout == 600
        assert config.subagent_max_concurrent == 5

    def test_checkpoint_fields_parsed(self):
        coord_cfg = {
            "checkpoint_enabled": True,
            "checkpoint_mode": "conversation",
            "checkpoint_guidance": "review code",
            "checkpoint_gated_patterns": ["*.py"],
        }
        config = _parse_coordination_config(coord_cfg)
        assert config.checkpoint_enabled is True
        assert config.checkpoint_mode == "conversation"
        assert config.checkpoint_guidance == "review code"
        assert config.checkpoint_gated_patterns == ["*.py"]

    def test_novelty_and_quality_fields_parsed(self):
        coord_cfg = {
            "enable_quality_rethink_on_iteration": True,
            "enable_novelty_on_iteration": True,
            "novelty_injection": "aggressive",
        }
        config = _parse_coordination_config(coord_cfg)
        assert config.enable_quality_rethink_on_iteration is True
        assert config.enable_novelty_on_iteration is True
        assert config.novelty_injection == "aggressive"


# ---------------------------------------------------------------------------
# Step 2: _apply_orchestrator_runtime_params covers more than the 3 fields
# the WebUI was manually setting
# ---------------------------------------------------------------------------


class TestOrchestratorRuntimeParamsParity:
    """Ensure _apply_orchestrator_runtime_params sets fields the WebUI was
    missing: voting_threshold, skip_final_presentation, disable_injection, etc."""

    def test_voting_sensitivity_applied(self):
        from massgen.agent_config import AgentConfig

        cfg = AgentConfig()
        _apply_orchestrator_runtime_params(cfg, {"voting_sensitivity": 0.8})
        assert cfg.voting_sensitivity == 0.8

    def test_voting_threshold_applied(self):
        from massgen.agent_config import AgentConfig

        cfg = AgentConfig()
        _apply_orchestrator_runtime_params(cfg, {"voting_threshold": 0.6})
        assert cfg.voting_threshold == 0.6

    def test_skip_final_presentation_applied(self):
        from massgen.agent_config import AgentConfig

        cfg = AgentConfig()
        _apply_orchestrator_runtime_params(
            cfg,
            {"skip_final_presentation": True},
        )
        assert cfg.skip_final_presentation is True

    def test_skip_voting_applied(self):
        from massgen.agent_config import AgentConfig

        cfg = AgentConfig()
        _apply_orchestrator_runtime_params(cfg, {"skip_voting": True})
        assert cfg.skip_voting is True

    def test_disable_injection_applied(self):
        from massgen.agent_config import AgentConfig

        cfg = AgentConfig()
        _apply_orchestrator_runtime_params(cfg, {"disable_injection": True})
        assert cfg.disable_injection is True

    def test_coordination_mode_applied(self):
        from massgen.agent_config import AgentConfig

        cfg = AgentConfig()
        _apply_orchestrator_runtime_params(
            cfg,
            {"coordination_mode": "decomposition"},
        )
        assert cfg.coordination_mode == "decomposition"

    def test_final_answer_strategy_applied(self):
        from massgen.agent_config import AgentConfig

        cfg = AgentConfig()
        _apply_orchestrator_runtime_params(
            cfg,
            {"final_answer_strategy": "best_vote"},
        )
        assert cfg.final_answer_strategy == "best_vote"


# ---------------------------------------------------------------------------
# Step 3: CLI overrides dict builder
# ---------------------------------------------------------------------------


class TestBuildCliOverridesDict:
    """Test _build_cli_overrides_dict extracts correct flags."""

    def test_empty_when_no_flags(self):
        from massgen.cli import _build_cli_overrides_dict

        args = _make_namespace()
        result = _build_cli_overrides_dict(args)
        assert result == {}

    def test_eval_criteria_extracted(self):
        from massgen.cli import _build_cli_overrides_dict

        args = _make_namespace(eval_criteria="/tmp/criteria.json")
        result = _build_cli_overrides_dict(args)
        assert result["eval_criteria"] == "/tmp/criteria.json"

    def test_checklist_criteria_preset_extracted(self):
        from massgen.cli import _build_cli_overrides_dict

        args = _make_namespace(checklist_criteria_preset="evaluation")
        result = _build_cli_overrides_dict(args)
        assert result["checklist_criteria_preset"] == "evaluation"

    def test_orchestrator_timeout_extracted(self):
        from massgen.cli import _build_cli_overrides_dict

        args = _make_namespace(orchestrator_timeout=600)
        result = _build_cli_overrides_dict(args)
        assert result["orchestrator_timeout"] == 600

    def test_cwd_context_extracted(self):
        from massgen.cli import _build_cli_overrides_dict

        args = _make_namespace(cwd_context="ro")
        result = _build_cli_overrides_dict(args)
        assert result["cwd_context"] == "ro"

    def test_multiple_flags_combined(self):
        from massgen.cli import _build_cli_overrides_dict

        args = _make_namespace(
            eval_criteria="/tmp/c.json",
            checklist_criteria_preset="persona",
        )
        result = _build_cli_overrides_dict(args)
        assert result["eval_criteria"] == "/tmp/c.json"
        assert result["checklist_criteria_preset"] == "persona"


# ---------------------------------------------------------------------------
# Step 4: _apply_cli_overrides applies each override type
# ---------------------------------------------------------------------------


class TestApplyCliOverrides:
    """Test _apply_cli_overrides modifies config dict correctly."""

    def test_empty_overrides_no_mutation(self):
        from massgen.frontend.web.server import _apply_cli_overrides

        config = {"orchestrator": {}}
        _apply_cli_overrides(config, {})
        assert config == {"orchestrator": {}}

    def test_none_overrides_no_mutation(self):
        from massgen.frontend.web.server import _apply_cli_overrides

        config = {"orchestrator": {}}
        _apply_cli_overrides(config, None)
        assert config == {"orchestrator": {}}

    def test_eval_criteria_injected(self, tmp_path):
        from massgen.frontend.web.server import _apply_cli_overrides

        criteria_file = tmp_path / "criteria.json"
        criteria_file.write_text(
            json.dumps([{"text": "check quality", "category": "must"}]),
        )
        config = {"orchestrator": {}}
        _apply_cli_overrides(config, {"eval_criteria": str(criteria_file)})
        inline = config["orchestrator"]["coordination"]["checklist_criteria_inline"]
        assert len(inline) == 1
        assert inline[0]["text"] == "check quality"

    def test_checklist_preset_injected(self):
        from massgen.frontend.web.server import _apply_cli_overrides

        config = {"orchestrator": {}}
        _apply_cli_overrides(
            config,
            {"checklist_criteria_preset": "evaluation"},
        )
        preset = config["orchestrator"]["coordination"]["checklist_criteria_preset"]
        assert preset == "evaluation"

    def test_orchestrator_timeout_injected(self):
        from massgen.frontend.web.server import _apply_cli_overrides

        config = {"orchestrator": {}}
        _apply_cli_overrides(config, {"orchestrator_timeout": 600})
        assert config["timeout_settings"]["orchestrator_timeout_seconds"] == 600

    def test_cwd_context_injected(self, monkeypatch, tmp_path):
        from massgen.frontend.web.server import _apply_cli_overrides

        # apply_cli_cwd_context_path uses os.getcwd()
        monkeypatch.chdir(tmp_path)
        config = {"orchestrator": {}}
        _apply_cli_overrides(config, {"cwd_context": "ro"})
        context_paths = config["orchestrator"].get("context_paths", [])
        assert any(str(tmp_path) in str(p) for p in context_paths)


# ---------------------------------------------------------------------------
# Step 5: Structural test — run_coordination uses _parse_coordination_config
# ---------------------------------------------------------------------------


class TestRunCoordinationUsesCanonicalHelpers:
    """Verify run_coordination() source calls canonical helpers."""

    def test_run_coordination_uses_parse_coordination_config(self):
        import inspect

        from massgen.frontend.web.server import run_coordination

        src = inspect.getsource(run_coordination)
        assert "_parse_coordination_config" in src, "run_coordination() must call _parse_coordination_config() " "instead of hand-rolling CoordinationConfig"

    def test_run_coordination_uses_apply_orchestrator_runtime_params(self):
        import inspect

        from massgen.frontend.web.server import run_coordination

        src = inspect.getsource(run_coordination)
        assert "_apply_orchestrator_runtime_params" in src, "run_coordination() must call _apply_orchestrator_runtime_params() " "instead of manually setting AgentConfig fields"

    def test_run_coordination_with_history_uses_parse_coordination_config(self):
        import inspect

        from massgen.frontend.web.server import run_coordination_with_history

        src = inspect.getsource(run_coordination_with_history)
        assert "_parse_coordination_config" in src, "run_coordination_with_history() must call _parse_coordination_config() " "instead of hand-rolling CoordinationConfig"

    def test_run_coordination_with_history_uses_apply_orchestrator_runtime_params(
        self,
    ):
        import inspect

        from massgen.frontend.web.server import run_coordination_with_history

        src = inspect.getsource(run_coordination_with_history)
        assert "_apply_orchestrator_runtime_params" in src, "run_coordination_with_history() must call " "_apply_orchestrator_runtime_params() instead of manually " "setting AgentConfig fields"

    def test_run_coordination_accepts_cli_overrides(self):
        import inspect

        from massgen.frontend.web.server import run_coordination

        sig = inspect.signature(run_coordination)
        assert "cli_overrides" in sig.parameters, "run_coordination() must accept a cli_overrides parameter"

    def test_run_coordination_with_history_accepts_cli_overrides(self):
        import inspect

        from massgen.frontend.web.server import run_coordination_with_history

        sig = inspect.signature(run_coordination_with_history)
        assert "cli_overrides" in sig.parameters, "run_coordination_with_history() must accept a cli_overrides parameter"


# ---------------------------------------------------------------------------
# Step 6: run_server accepts question for auto-start
# ---------------------------------------------------------------------------


class TestRunServerAcceptsQuestion:
    """Verify run_server() and create_app() accept the question parameter."""

    def test_run_server_accepts_cli_overrides(self):
        import inspect

        from massgen.frontend.web.server import run_server

        sig = inspect.signature(run_server)
        assert "cli_overrides" in sig.parameters, "run_server() must accept cli_overrides"

    def test_create_app_stores_cli_overrides(self):
        from massgen.frontend.web.server import create_app

        app = create_app(cli_overrides={"eval_criteria": "/tmp/test.json"})
        assert app.state.cli_overrides == {"eval_criteria": "/tmp/test.json"}

    def test_create_app_stores_none_cli_overrides(self):
        from massgen.frontend.web.server import create_app

        app = create_app()
        assert app.state.cli_overrides is None

    def test_build_cli_overrides_default_config_resolution(self):
        """When --web --automation is used without --config, cli_main should
        resolve the default config path."""
        from massgen.cli import _build_cli_overrides_dict

        # Just verify the function works with no config-related fields
        args = _make_namespace()
        result = _build_cli_overrides_dict(args)
        assert isinstance(result, dict)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_namespace(**kwargs):
    """Create a minimal argparse-like namespace with defaults."""
    import argparse

    defaults = {
        "eval_criteria": None,
        "checklist_criteria_preset": None,
        "orchestrator_timeout": None,
        "cwd_context": None,
    }
    defaults.update(kwargs)
    return argparse.Namespace(**defaults)
