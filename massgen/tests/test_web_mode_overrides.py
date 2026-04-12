"""Tests for WebUI mode bar override application logic."""

import copy
import json
from pathlib import Path

import pytest
import yaml


def _make_base_config(num_agents: int = 3) -> dict:
    """Create a minimal config dict for testing."""
    agents = []
    for i in range(num_agents):
        agent_id = f"agent_{chr(97 + i)}"
        agents.append(
            {
                "id": agent_id,
                "backend": {"type": "chat_completions"},
                "backend_params": {"model": "gpt-4o"},
            },
        )
    return {
        "agents": agents,
        "orchestrator": {},
    }


# Import the helper under test — deferred to avoid import errors during collection
@pytest.fixture()
def apply_fn():
    from massgen.frontend.web.server import _apply_mode_overrides

    return _apply_mode_overrides


@pytest.fixture()
def apply_agent_fn():
    from massgen.frontend.web.server import _apply_agent_overrides

    return _apply_agent_overrides


@pytest.fixture()
def apply_docker_fn():
    from massgen.frontend.web.server import _apply_docker_override

    return _apply_docker_override


class TestApplyModeOverrides:
    def test_empty_overrides_no_mutation(self, apply_fn):
        config = _make_base_config()
        original = copy.deepcopy(config)
        apply_fn(config, {})
        assert config == original

    def test_none_overrides_no_mutation(self, apply_fn):
        config = _make_base_config()
        original = copy.deepcopy(config)
        apply_fn(config, None)
        assert config == original

    def test_coordination_mode_override(self, apply_fn):
        config = _make_base_config()
        apply_fn(config, {"coordination_mode": "decomposition"})
        assert config["orchestrator"]["coordination_mode"] == "decomposition"

    def test_quick_mode_multi_agent(self, apply_fn):
        config = _make_base_config()
        overrides = {
            "max_new_answers_per_agent": 1,
            "skip_final_presentation": True,
            "disable_injection": True,
            "defer_voting_until_all_answered": True,
            "final_answer_strategy": "synthesize",
        }
        apply_fn(config, overrides)
        orch = config["orchestrator"]
        assert orch["max_new_answers_per_agent"] == 1
        assert orch["skip_final_presentation"] is True
        assert orch["disable_injection"] is True
        assert orch["defer_voting_until_all_answered"] is True
        assert orch["final_answer_strategy"] == "synthesize"

    def test_quick_mode_single_agent(self, apply_fn):
        config = _make_base_config(num_agents=1)
        overrides = {
            "max_new_answers_per_agent": 1,
            "skip_voting": True,
            "skip_final_presentation": True,
        }
        apply_fn(config, overrides)
        orch = config["orchestrator"]
        assert orch["max_new_answers_per_agent"] == 1
        assert orch["skip_voting"] is True
        assert orch["skip_final_presentation"] is True

    def test_persona_overrides(self, apply_fn):
        config = _make_base_config()
        overrides = {
            "persona_generator_enabled": True,
            "persona_diversity_mode": "methodology",
        }
        apply_fn(config, overrides)
        pg = config["orchestrator"]["coordination"]["persona_generator"]
        assert pg["enabled"] is True
        assert pg["diversity_mode"] == "methodology"

    def test_persona_overrides_disabled(self, apply_fn):
        """When persona_generator_enabled is not in overrides, no persona config is added."""
        config = _make_base_config()
        apply_fn(config, {"coordination_mode": "voting"})
        orch = config["orchestrator"]
        assert "coordination" not in orch or "persona_generator" not in orch.get(
            "coordination",
            {},
        )

    def test_plan_mode_overrides(self, apply_fn):
        config = _make_base_config()
        apply_fn(
            config,
            {
                "plan_mode": "plan",
                "enable_agent_task_planning": True,
                "task_planning_filesystem_mode": True,
            },
        )
        coord = config["orchestrator"]["coordination"]
        assert coord["enable_agent_task_planning"] is True
        assert coord["task_planning_filesystem_mode"] is True

    def test_plan_mode_spec(self, apply_fn):
        config = _make_base_config()
        apply_fn(config, {"plan_mode": "spec"})
        coord = config["orchestrator"]["coordination"]
        assert coord["enable_agent_task_planning"] is True
        assert coord["spec_mode"] is True

    def test_plan_mode_analyze(self, apply_fn):
        config = _make_base_config()
        apply_fn(config, {"plan_mode": "analyze"})
        coord = config["orchestrator"]["coordination"]
        assert coord["enable_agent_task_planning"] is True
        assert coord["analysis_mode"] is True

    def test_plan_mode_normal_no_overrides(self, apply_fn):
        config = _make_base_config()
        apply_fn(config, {"plan_mode": "normal"})
        orch = config["orchestrator"]
        # Normal mode should not set coordination planning keys
        assert "coordination" not in orch or "enable_agent_task_planning" not in orch.get(
            "coordination",
            {},
        )


class TestApplyAgentOverrides:
    def test_agent_count_increase(self, apply_agent_fn):
        config = _make_base_config(num_agents=2)
        apply_agent_fn(config, {"agent_count": 4})
        assert len(config["agents"]) == 4
        # New agents should have IDs agent_c, agent_d
        ids = [a["id"] for a in config["agents"]]
        assert ids == ["agent_a", "agent_b", "agent_c", "agent_d"]

    def test_agent_count_decrease(self, apply_agent_fn):
        config = _make_base_config(num_agents=5)
        apply_agent_fn(config, {"agent_count": 2})
        assert len(config["agents"]) == 2
        ids = [a["id"] for a in config["agents"]]
        assert ids == ["agent_a", "agent_b"]

    def test_agent_count_same_no_change(self, apply_agent_fn):
        config = _make_base_config(num_agents=3)
        original_ids = [a["id"] for a in config["agents"]]
        apply_agent_fn(config, {"agent_count": 3})
        assert [a["id"] for a in config["agents"]] == original_ids

    def test_agent_model_override(self, apply_agent_fn):
        config = _make_base_config(num_agents=3)
        apply_agent_fn(config, {"agent_model": "claude-sonnet-4-5-20250514"})
        for agent in config["agents"]:
            assert agent["backend_params"]["model"] == "claude-sonnet-4-5-20250514"

    def test_agent_backend_override(self, apply_agent_fn):
        config = _make_base_config(num_agents=2)
        apply_agent_fn(config, {"agent_backend": "anthropic"})
        for agent in config["agents"]:
            assert agent["backend"]["type"] == "anthropic"

    def test_combined_agent_overrides(self, apply_agent_fn):
        config = _make_base_config(num_agents=2)
        apply_agent_fn(
            config,
            {
                "agent_count": 4,
                "agent_model": "gemini-2.5-pro",
                "agent_backend": "gemini",
            },
        )
        assert len(config["agents"]) == 4
        for agent in config["agents"]:
            assert agent["backend_params"]["model"] == "gemini-2.5-pro"
            assert agent["backend"]["type"] == "gemini"

    def test_per_agent_overrides_model(self, apply_agent_fn):
        config = _make_base_config(num_agents=3)
        apply_agent_fn(
            config,
            {
                "agent_overrides": [
                    {"model": "gpt-4o-mini"},
                    {"model": "claude-sonnet-4-5-20250514"},
                    {},
                ],
            },
        )
        assert config["agents"][0]["backend_params"]["model"] == "gpt-4o-mini"
        assert config["agents"][1]["backend_params"]["model"] == "claude-sonnet-4-5-20250514"
        # Third agent unchanged (empty override)
        assert config["agents"][2]["backend_params"]["model"] == "gpt-4o"

    def test_per_agent_overrides_backend(self, apply_agent_fn):
        config = _make_base_config(num_agents=2)
        apply_agent_fn(
            config,
            {"agent_overrides": [{"backend_type": "anthropic"}, {}]},
        )
        assert config["agents"][0]["backend"]["type"] == "anthropic"
        assert config["agents"][1]["backend"]["type"] == "chat_completions"

    def test_per_agent_overrides_partial(self, apply_agent_fn):
        config = _make_base_config(num_agents=3)
        apply_agent_fn(
            config,
            {
                "agent_overrides": [
                    {"model": "gpt-4o-mini", "backend_type": "openai"},
                    {},
                    {},
                ],
            },
        )
        assert config["agents"][0]["backend_params"]["model"] == "gpt-4o-mini"
        assert config["agents"][0]["backend"]["type"] == "openai"
        # Others unchanged
        assert config["agents"][1]["backend_params"]["model"] == "gpt-4o"
        assert config["agents"][2]["backend_params"]["model"] == "gpt-4o"

    def test_per_agent_overrides_excess_ignored(self, apply_agent_fn):
        config = _make_base_config(num_agents=2)
        apply_agent_fn(
            config,
            {
                "agent_overrides": [
                    {"model": "a"},
                    {"model": "b"},
                    {"model": "c"},
                    {"model": "d"},
                ],
            },
        )
        assert len(config["agents"]) == 2
        assert config["agents"][0]["backend_params"]["model"] == "a"
        assert config["agents"][1]["backend_params"]["model"] == "b"

    def test_per_agent_overrides_with_count(self, apply_agent_fn):
        config = _make_base_config(num_agents=2)
        apply_agent_fn(
            config,
            {
                "agent_count": 4,
                "agent_overrides": [
                    {"model": "x"},
                    {},
                    {"model": "y"},
                    {},
                ],
            },
        )
        assert len(config["agents"]) == 4
        assert config["agents"][0]["backend_params"]["model"] == "x"
        assert config["agents"][2]["backend_params"]["model"] == "y"

    def test_per_agent_overrides_model_in_backend(self, apply_agent_fn):
        """Model override works when config uses backend.model instead of backend_params.model."""
        config = {
            "agents": [
                {
                    "id": "agent_a",
                    "backend": {"type": "claude_code", "model": "gpt-5.4"},
                },
            ],
            "orchestrator": {},
        }
        apply_agent_fn(
            config,
            {"agent_overrides": [{"model": "claude-opus-4-6"}]},
        )
        # Should update backend.model (where the config stores it)
        assert config["agents"][0]["backend"]["model"] == "claude-opus-4-6"

    def test_per_agent_overrides_model_in_both_locations(self, apply_agent_fn):
        """Model override updates both locations when config has both."""
        config = {
            "agents": [
                {
                    "id": "agent_a",
                    "backend": {"type": "chat_completions", "model": "old"},
                    "backend_params": {"model": "old"},
                },
            ],
            "orchestrator": {},
        }
        apply_agent_fn(
            config,
            {"agent_overrides": [{"model": "new-model"}]},
        )
        assert config["agents"][0]["backend"]["model"] == "new-model"
        assert config["agents"][0]["backend_params"]["model"] == "new-model"

    def test_per_agent_overrides_reasoning_effort(self, apply_agent_fn):
        config = _make_base_config(num_agents=2)
        apply_agent_fn(
            config,
            {
                "agent_overrides": [
                    {"reasoning_effort": "high"},
                    {},
                ],
            },
        )
        assert config["agents"][0]["backend"]["reasoning"] == {
            "effort": "high",
            "summary": "auto",
        }
        # Second agent unchanged
        assert "reasoning" not in config["agents"][1].get("backend", {})

    def test_per_agent_overrides_web_search(self, apply_agent_fn):
        config = _make_base_config(num_agents=2)
        apply_agent_fn(
            config,
            {
                "agent_overrides": [
                    {"enable_web_search": True},
                    {"enable_web_search": False},
                ],
            },
        )
        assert config["agents"][0]["backend"]["enable_web_search"] is True
        assert config["agents"][1]["backend"]["enable_web_search"] is False

    def test_per_agent_overrides_code_execution_openai(self, apply_agent_fn):
        config = _make_base_config(num_agents=1)
        # Agent has openai backend type
        config["agents"][0]["backend"]["type"] = "openai"
        apply_agent_fn(
            config,
            {"agent_overrides": [{"enable_code_execution": True}]},
        )
        # For openai, should use enable_code_interpreter
        assert config["agents"][0]["backend"]["enable_code_interpreter"] is True

    def test_per_agent_overrides_code_execution_chat_completions(self, apply_agent_fn):
        config = _make_base_config(num_agents=1)
        config["agents"][0]["backend"]["type"] = "chat_completions"
        apply_agent_fn(
            config,
            {"agent_overrides": [{"enable_code_execution": True}]},
        )
        assert config["agents"][0]["backend"]["enable_code_interpreter"] is True

    def test_per_agent_overrides_code_execution_anthropic(self, apply_agent_fn):
        config = _make_base_config(num_agents=1)
        config["agents"][0]["backend"]["type"] = "anthropic"
        apply_agent_fn(
            config,
            {"agent_overrides": [{"enable_code_execution": True}]},
        )
        # For non-openai, should use enable_code_execution
        assert config["agents"][0]["backend"]["enable_code_execution"] is True


class TestApplyDockerOverride:
    def test_docker_enable(self, apply_docker_fn):
        config = _make_base_config()
        apply_docker_fn(config, True)
        for agent in config["agents"]:
            backend = agent["backend"]
            assert backend["command_line_execution_mode"] == "docker"
            assert backend["enable_code_based_tools"] is True
            assert backend["exclude_file_operation_mcps"] is True
            assert backend["enable_mcp_command_line"] is True
            assert backend["command_line_docker_image"] == "ghcr.io/massgen/mcp-runtime-sudo:latest"
            assert backend["command_line_docker_network_mode"] == "bridge"
            assert backend["command_line_docker_enable_sudo"] is True
            assert "env_file" in backend["command_line_docker_credentials"]
            assert backend["shared_tools_directory"] == "shared_tools"

    def test_docker_disable(self, apply_docker_fn):
        config = _make_base_config()
        # First enable, then disable
        apply_docker_fn(config, True)
        apply_docker_fn(config, False)
        for agent in config["agents"]:
            backend = agent["backend"]
            assert "command_line_execution_mode" not in backend
            assert "enable_code_based_tools" not in backend
            assert "command_line_docker_image" not in backend
            assert backend["exclude_file_operation_mcps"] is False

    def test_docker_preserves_existing_backend(self, apply_docker_fn):
        config = _make_base_config()
        # Add custom backend fields that should survive docker toggle
        config["agents"][0]["backend"]["type"] = "anthropic"
        config["agents"][0]["backend"]["model"] = "claude-sonnet-4-5-20250514"
        apply_docker_fn(config, True)
        assert config["agents"][0]["backend"]["type"] == "anthropic"
        assert config["agents"][0]["backend"]["model"] == "claude-sonnet-4-5-20250514"
        assert config["agents"][0]["backend"]["command_line_execution_mode"] == "docker"


class TestPlanModeOverrides:
    def test_plan_mode_sets_coordination_keys(self, apply_fn):
        config = _make_base_config()
        apply_fn(config, {"plan_mode": "plan"})
        coord = config["orchestrator"]["coordination"]
        assert coord["enable_agent_task_planning"] is True
        assert coord["task_planning_filesystem_mode"] is True
        assert "spec_mode" not in coord
        assert "analysis_mode" not in coord

    def test_plan_mode_spec_sets_spec_mode(self, apply_fn):
        config = _make_base_config()
        apply_fn(config, {"plan_mode": "spec"})
        coord = config["orchestrator"]["coordination"]
        assert coord["spec_mode"] is True

    def test_plan_mode_analyze_sets_analysis_mode(self, apply_fn):
        config = _make_base_config()
        apply_fn(config, {"plan_mode": "analyze"})
        coord = config["orchestrator"]["coordination"]
        assert coord["analysis_mode"] is True


class TestCombinedOverrides:
    def test_all_override_types_together(self, apply_fn):
        config = _make_base_config(num_agents=2)
        overrides = {
            "coordination_mode": "decomposition",
            "max_new_answers_per_agent": 1,
            "skip_final_presentation": True,
            "persona_generator_enabled": True,
            "persona_diversity_mode": "perspective",
            "agent_count": 4,
            "agent_model": "gpt-4o-mini",
            "docker_override": True,
        }
        apply_fn(config, overrides)

        # Orchestrator
        assert config["orchestrator"]["coordination_mode"] == "decomposition"
        assert config["orchestrator"]["max_new_answers_per_agent"] == 1

        # Personas
        pg = config["orchestrator"]["coordination"]["persona_generator"]
        assert pg["enabled"] is True

        # Agents
        assert len(config["agents"]) == 4
        for agent in config["agents"]:
            assert agent["backend_params"]["model"] == "gpt-4o-mini"

        # Docker — per-agent backend keys
        for agent in config["agents"]:
            assert agent["backend"]["command_line_execution_mode"] == "docker"


class TestWebuiStatePersistence:
    """Tests for /api/webui/save-state and /api/webui/state endpoints."""

    @pytest.fixture()
    def save_state_fn(self):
        from massgen.frontend.web.server import _save_webui_state

        return _save_webui_state

    @pytest.fixture()
    def load_state_fn(self):
        from massgen.frontend.web.server import _load_webui_state

        return _load_webui_state

    def test_save_state_creates_webui_config_yaml(self, save_state_fn, tmp_path):
        """POST to save-state creates a valid YAML file."""
        agent_settings = {
            "agents": [
                {"id": "agent_a", "provider": "openai", "model": "gpt-4o"},
                {"id": "agent_b", "provider": "anthropic", "model": "claude-sonnet-4-5-20250514"},
            ],
            "use_docker": False,
        }
        ui_state = {
            "coordinationMode": "parallel",
            "refinementEnabled": True,
            "personasMode": "off",
            "planMode": "normal",
            "maxAnswers": None,
            "agentMode": "multi",
        }
        result = save_state_fn(
            agent_settings=agent_settings,
            ui_state=ui_state,
            base_dir=tmp_path,
        )
        assert result["success"] is True
        config_path = Path(result["config_path"])
        assert config_path.exists()
        assert config_path.name == "webui_config.yaml"

        # Verify it's valid YAML with agents
        with open(config_path) as f:
            config = yaml.safe_load(f)
        assert "agents" in config
        assert len(config["agents"]) == 2

    def test_save_state_creates_webui_state_json(self, save_state_fn, tmp_path):
        """UI state saved correctly to JSON."""
        agent_settings = {
            "agents": [
                {"id": "agent_a", "provider": "openai", "model": "gpt-4o"},
            ],
            "use_docker": False,
        }
        ui_state = {
            "coordinationMode": "decomposition",
            "refinementEnabled": False,
            "personasMode": "perspective",
            "planMode": "plan",
            "maxAnswers": 3,
            "agentMode": "multi",
        }
        save_state_fn(
            agent_settings=agent_settings,
            ui_state=ui_state,
            base_dir=tmp_path,
        )
        state_path = tmp_path / ".massgen" / "webui_state.json"
        assert state_path.exists()
        with open(state_path) as f:
            saved_state = json.load(f)
        assert saved_state["coordinationMode"] == "decomposition"
        assert saved_state["refinementEnabled"] is False
        assert saved_state["personasMode"] == "perspective"
        assert saved_state["planMode"] == "plan"
        assert saved_state["maxAnswers"] == 3

    def test_get_state_returns_existing(self, save_state_fn, load_state_fn, tmp_path):
        """GET returns saved state when files exist."""
        agent_settings = {
            "agents": [
                {"id": "agent_a", "provider": "openai", "model": "gpt-4o"},
            ],
            "use_docker": False,
        }
        ui_state = {
            "coordinationMode": "parallel",
            "refinementEnabled": True,
            "personasMode": "off",
            "planMode": "normal",
            "maxAnswers": None,
            "agentMode": "multi",
        }
        save_state_fn(
            agent_settings=agent_settings,
            ui_state=ui_state,
            base_dir=tmp_path,
        )
        result = load_state_fn(base_dir=tmp_path)
        assert result["exists"] is True
        assert result["config_path"] is not None
        assert result["ui_state"] is not None
        assert result["ui_state"]["coordinationMode"] == "parallel"

    def test_get_state_returns_not_exists(self, load_state_fn, tmp_path):
        """GET returns exists: false when no webui_config.yaml."""
        result = load_state_fn(base_dir=tmp_path)
        assert result["exists"] is False
        assert result["config_path"] is None
        assert result["ui_state"] is None

    def test_save_state_regenerates_yaml_on_agent_change(
        self,
        save_state_fn,
        tmp_path,
    ):
        """Changing agents regenerates YAML via ConfigBuilder."""
        ui_state = {
            "coordinationMode": "parallel",
            "refinementEnabled": True,
            "personasMode": "off",
            "planMode": "normal",
            "maxAnswers": None,
            "agentMode": "multi",
        }
        # First save with 1 agent
        save_state_fn(
            agent_settings={
                "agents": [{"id": "agent_a", "provider": "openai", "model": "gpt-4o"}],
                "use_docker": False,
            },
            ui_state=ui_state,
            base_dir=tmp_path,
        )
        config_path = tmp_path / ".massgen" / "webui_config.yaml"
        with open(config_path) as f:
            config1 = yaml.safe_load(f)
        assert len(config1["agents"]) == 1

        # Second save with 3 agents
        save_state_fn(
            agent_settings={
                "agents": [
                    {"id": "agent_a", "provider": "openai", "model": "gpt-4o"},
                    {"id": "agent_b", "provider": "anthropic", "model": "claude-sonnet-4-5-20250514"},
                    {"id": "agent_c", "provider": "gemini", "model": "gemini-2.5-pro"},
                ],
                "use_docker": False,
            },
            ui_state=ui_state,
            base_dir=tmp_path,
        )
        with open(config_path) as f:
            config2 = yaml.safe_load(f)
        assert len(config2["agents"]) == 3

    def test_webui_config_yaml_is_valid_massgen_config(
        self,
        save_state_fn,
        tmp_path,
    ):
        """Generated YAML has the structure expected by MassGen."""
        agent_settings = {
            "agents": [
                {"id": "agent_a", "provider": "openai", "model": "gpt-4o"},
                {"id": "agent_b", "provider": "anthropic", "model": "claude-sonnet-4-5-20250514"},
            ],
            "use_docker": True,
        }
        ui_state = {
            "coordinationMode": "parallel",
            "refinementEnabled": True,
            "personasMode": "off",
            "planMode": "normal",
            "maxAnswers": None,
            "agentMode": "multi",
        }
        result = save_state_fn(
            agent_settings=agent_settings,
            ui_state=ui_state,
            base_dir=tmp_path,
        )
        config_path = Path(result["config_path"])
        with open(config_path) as f:
            config = yaml.safe_load(f)

        # Must have agents and orchestrator (standard MassGen config structure)
        assert "agents" in config
        assert "orchestrator" in config
        assert len(config["agents"]) == 2
        # Each agent must have id and backend
        for agent in config["agents"]:
            assert "id" in agent
            assert "backend" in agent
            assert "type" in agent["backend"]
            assert "model" in agent["backend"]
