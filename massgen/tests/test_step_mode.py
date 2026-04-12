"""Tests for MassGen step mode.

Step mode runs one agent for one step (new_answer or vote), then exits.
Prior answers/workspaces are loaded from a session directory.

TDD: These tests are written first, then implementation follows.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from massgen.orchestrator import Orchestrator

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_answer(session_dir: Path, agent_id: str, step: int, answer_text: str, timestamp: str = "2026-03-18T12:00:00Z") -> Path:
    """Write an answer.json into the session dir at the correct step."""
    step_dir = session_dir / "agents" / agent_id / f"{step:03d}"
    step_dir.mkdir(parents=True, exist_ok=True)
    answer_file = step_dir / "answer.json"
    answer_file.write_text(
        json.dumps(
            {
                "agent_id": agent_id,
                "answer": answer_text,
                "timestamp": timestamp,
            },
        ),
    )
    return step_dir


def _write_vote(session_dir: Path, agent_id: str, step: int, target: str, seen_steps: dict[str, int], reason: str = "Better approach") -> Path:
    """Write a vote.json into the session dir at the correct step."""
    step_dir = session_dir / "agents" / agent_id / f"{step:03d}"
    step_dir.mkdir(parents=True, exist_ok=True)
    vote_file = step_dir / "vote.json"
    vote_file.write_text(
        json.dumps(
            {
                "voter": agent_id,
                "target": target,
                "reason": reason,
                "seen_steps": seen_steps,
            },
        ),
    )
    return step_dir


def _write_workspace(session_dir: Path, agent_id: str, step: int, files: dict[str, str] | None = None) -> Path:
    """Create a workspace directory with optional files."""
    ws_dir = session_dir / "agents" / agent_id / f"{step:03d}" / "workspace"
    ws_dir.mkdir(parents=True, exist_ok=True)
    if files:
        for name, content in files.items():
            (ws_dir / name).write_text(content)
    return ws_dir


# ---------------------------------------------------------------------------
# A0.1: StepModeConfig dataclass
# ---------------------------------------------------------------------------


class TestStepModeConfig:
    """Tests for the StepModeConfig dataclass."""

    def test_import(self) -> None:
        """StepModeConfig is importable from agent_config."""
        from massgen.agent_config import StepModeConfig

        assert StepModeConfig is not None

    def test_defaults(self) -> None:
        """StepModeConfig has sensible defaults."""
        from massgen.agent_config import StepModeConfig

        cfg = StepModeConfig()
        assert cfg.enabled is False
        assert cfg.session_dir == ""

    def test_enabled(self) -> None:
        """StepModeConfig can be created with enabled=True."""
        from massgen.agent_config import StepModeConfig

        cfg = StepModeConfig(enabled=True, session_dir="/tmp/test_session")
        assert cfg.enabled is True
        assert cfg.session_dir == "/tmp/test_session"


# ---------------------------------------------------------------------------
# A0.2: Session directory loading
# ---------------------------------------------------------------------------


class TestSessionDirLoading:
    """Tests for loading session directory state into orchestrator."""

    def test_load_empty_session_dir(self, tmp_path: Path) -> None:
        """Empty session dir (no agents/) is valid — first round, no prior context."""
        from massgen.agent_config import StepModeConfig

        session_dir = tmp_path / "session"
        session_dir.mkdir()
        (session_dir / "agents").mkdir()

        cfg = StepModeConfig(enabled=True, session_dir=str(session_dir))
        # Should load without error — result is no virtual agents
        from massgen.step_mode import load_session_dir_inputs

        inputs = load_session_dir_inputs(cfg.session_dir)
        assert inputs.virtual_agents == {}

    def test_load_single_agent_answer(self, tmp_path: Path) -> None:
        """Load a single agent's answer from session dir."""
        from massgen.step_mode import load_session_dir_inputs

        session_dir = tmp_path / "session"
        _write_answer(session_dir, "agent_a", 1, "Hello world")

        inputs = load_session_dir_inputs(str(session_dir))
        assert "agent_a" in inputs.virtual_agents
        assert inputs.virtual_agents["agent_a"].latest_answer == "Hello world"
        assert inputs.virtual_agents["agent_a"].latest_step == 1

    def test_load_multiple_agents(self, tmp_path: Path) -> None:
        """Load multiple agents from session dir."""
        from massgen.step_mode import load_session_dir_inputs

        session_dir = tmp_path / "session"
        _write_answer(session_dir, "agent_a", 1, "Answer A")
        _write_answer(session_dir, "agent_b", 1, "Answer B")
        _write_answer(session_dir, "agent_c", 1, "Answer C")

        inputs = load_session_dir_inputs(str(session_dir))
        assert len(inputs.virtual_agents) == 3
        assert inputs.virtual_agents["agent_a"].latest_answer == "Answer A"
        assert inputs.virtual_agents["agent_b"].latest_answer == "Answer B"
        assert inputs.virtual_agents["agent_c"].latest_answer == "Answer C"

    def test_load_agent_at_multiple_steps(self, tmp_path: Path) -> None:
        """Latest step is used when agent has multiple steps."""
        from massgen.step_mode import load_session_dir_inputs

        session_dir = tmp_path / "session"
        _write_answer(session_dir, "agent_a", 1, "First answer")
        _write_answer(session_dir, "agent_a", 2, "Revised answer")
        _write_answer(session_dir, "agent_a", 3, "Final answer")

        inputs = load_session_dir_inputs(str(session_dir))
        assert inputs.virtual_agents["agent_a"].latest_answer == "Final answer"
        assert inputs.virtual_agents["agent_a"].latest_step == 3

    def test_load_agents_at_independent_step_counts(self, tmp_path: Path) -> None:
        """Agents can be at different step counts."""
        from massgen.step_mode import load_session_dir_inputs

        session_dir = tmp_path / "session"
        # agent_a at step 5
        _write_answer(session_dir, "agent_a", 1, "A v1")
        _write_answer(session_dir, "agent_a", 2, "A v2")
        _write_vote(session_dir, "agent_a", 3, "agent_b", {"agent_a": 2, "agent_b": 1})
        _write_answer(session_dir, "agent_a", 4, "A v3")
        _write_vote(session_dir, "agent_a", 5, "agent_b", {"agent_a": 4, "agent_b": 2})
        # agent_b at step 2
        _write_answer(session_dir, "agent_b", 1, "B v1")
        _write_answer(session_dir, "agent_b", 2, "B v2")

        inputs = load_session_dir_inputs(str(session_dir))
        # agent_a's latest answer is at step 4 (step 5 is a vote)
        assert inputs.virtual_agents["agent_a"].latest_answer == "A v3"
        assert inputs.virtual_agents["agent_a"].latest_step == 5
        # agent_b's latest answer is at step 2
        assert inputs.virtual_agents["agent_b"].latest_answer == "B v2"
        assert inputs.virtual_agents["agent_b"].latest_step == 2

    def test_vote_step_not_loaded_as_answer(self, tmp_path: Path) -> None:
        """Vote files are tracked but not loaded as answers."""
        from massgen.step_mode import load_session_dir_inputs

        session_dir = tmp_path / "session"
        _write_answer(session_dir, "agent_a", 1, "My answer")
        _write_vote(session_dir, "agent_a", 2, "agent_b", {"agent_a": 1, "agent_b": 1})

        inputs = load_session_dir_inputs(str(session_dir))
        # Latest answer should still be step 1's answer, not the vote
        assert inputs.virtual_agents["agent_a"].latest_answer == "My answer"
        assert inputs.virtual_agents["agent_a"].latest_step == 2

    def test_workspace_paths_loaded(self, tmp_path: Path) -> None:
        """Workspace directories are associated with answer steps."""
        from massgen.step_mode import load_session_dir_inputs

        session_dir = tmp_path / "session"
        _write_answer(session_dir, "agent_a", 1, "My answer")
        _write_workspace(session_dir, "agent_a", 1, {"index.html": "<html>test</html>"})

        inputs = load_session_dir_inputs(str(session_dir))
        assert inputs.virtual_agents["agent_a"].latest_workspace is not None
        assert (Path(inputs.virtual_agents["agent_a"].latest_workspace) / "index.html").exists()

    def test_no_agents_dir_creates_empty(self, tmp_path: Path) -> None:
        """Session dir without agents/ subdir is valid (first round)."""
        from massgen.step_mode import load_session_dir_inputs

        session_dir = tmp_path / "session"
        session_dir.mkdir()

        inputs = load_session_dir_inputs(str(session_dir))
        assert inputs.virtual_agents == {}


# ---------------------------------------------------------------------------
# A0.3: Step mode output writing
# ---------------------------------------------------------------------------


class TestStepModeOutput:
    """Tests for writing step mode outputs."""

    def test_save_answer_output(self, tmp_path: Path) -> None:
        """Saving an answer creates the correct directory structure."""
        from massgen.step_mode import save_step_mode_output

        session_dir = tmp_path / "session"
        (session_dir / "agents" / "agent_a").mkdir(parents=True)

        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text="My new answer",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=45.2,
            cost={"input_tokens": 5000, "output_tokens": 3000, "estimated_cost": 0.08},
        )

        # Check answer.json was written in step 001
        answer_file = session_dir / "agents" / "agent_a" / "001" / "answer.json"
        assert answer_file.exists()
        data = json.loads(answer_file.read_text())
        assert data["agent_id"] == "agent_a"
        assert data["answer"] == "My new answer"
        assert "timestamp" in data

        # Check per-agent last_action.json
        last_action = session_dir / "agents" / "agent_a" / "last_action.json"
        assert last_action.exists()
        action_data = json.loads(last_action.read_text())
        assert action_data["action"] == "new_answer"
        assert action_data["agent_id"] == "agent_a"
        assert action_data["answer_text"] == "My new answer"
        assert action_data["duration_seconds"] == 45.2
        # No global last_action.json (avoids race in parallel runs)
        assert not (session_dir / "last_action.json").exists()

    def test_save_vote_output(self, tmp_path: Path) -> None:
        """Saving a vote creates vote.json with seen_steps."""
        from massgen.step_mode import save_step_mode_output

        session_dir = tmp_path / "session"
        # Pre-existing answer at step 1
        _write_answer(session_dir, "agent_a", 1, "Prior answer")

        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="vote",
            answer_text=None,
            vote_target="agent_b",
            vote_reason="Better approach",
            seen_steps={"agent_a": 1, "agent_b": 2},
            duration_seconds=30.0,
            cost={"input_tokens": 3000, "output_tokens": 1000, "estimated_cost": 0.04},
        )

        # Vote should be at step 002 (next after existing step 001)
        vote_file = session_dir / "agents" / "agent_a" / "002" / "vote.json"
        assert vote_file.exists()
        data = json.loads(vote_file.read_text())
        assert data["voter"] == "agent_a"
        assert data["target"] == "agent_b"
        assert data["seen_steps"] == {"agent_a": 1, "agent_b": 2}

    def test_save_increments_step_number(self, tmp_path: Path) -> None:
        """Each save increments the step number."""
        from massgen.step_mode import save_step_mode_output

        session_dir = tmp_path / "session"
        # Pre-existing steps 1, 2, 3
        _write_answer(session_dir, "agent_a", 1, "v1")
        _write_answer(session_dir, "agent_a", 2, "v2")
        _write_vote(session_dir, "agent_a", 3, "agent_b", {"agent_a": 2, "agent_b": 1})

        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text="v3",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=50.0,
            cost={},
        )

        # Should be at step 004
        answer_file = session_dir / "agents" / "agent_a" / "004" / "answer.json"
        assert answer_file.exists()

    def test_save_first_step_with_no_prior(self, tmp_path: Path) -> None:
        """First save when agent has no prior steps creates step 001."""
        from massgen.step_mode import save_step_mode_output

        session_dir = tmp_path / "session"
        session_dir.mkdir(parents=True)

        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_x",
            action="new_answer",
            answer_text="First answer",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=20.0,
            cost={},
        )

        answer_file = session_dir / "agents" / "agent_x" / "001" / "answer.json"
        assert answer_file.exists()

    def test_save_copies_workspace(self, tmp_path: Path) -> None:
        """save_step_mode_output copies workspace when workspace_source provided."""
        from massgen.step_mode import save_step_mode_output

        ws = tmp_path / "workspace_src"
        ws.mkdir()
        (ws / "index.html").write_text("<html>hello</html>")
        (ws / "style.css").write_text("body {}")

        session_dir = tmp_path / "session"
        step_dir = save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text="My answer",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=10.0,
            workspace_source=str(ws),
        )

        ws_dest = step_dir / "workspace"
        assert ws_dest.is_dir()
        assert (ws_dest / "index.html").read_text() == "<html>hello</html>"
        assert (ws_dest / "style.css").read_text() == "body {}"

    def test_save_replaces_stale_workspace_paths_in_answer_text(self, tmp_path: Path) -> None:
        """Stale workspace paths in answer_text are replaced with session dir paths."""
        from massgen.step_mode import save_step_mode_output

        ws = tmp_path / "workspace_src"
        ws.mkdir()
        (ws / "index.html").write_text("<html>test</html>")

        stale_path = str(ws)
        answer_text = f"I created index.html at {stale_path}/index.html\nWorkspace: {stale_path}"

        session_dir = tmp_path / "session"
        step_dir = save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text=answer_text,
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=10.0,
            workspace_source=stale_path,
        )

        saved = json.loads((step_dir / "answer.json").read_text())
        session_ws = str(step_dir / "workspace")
        assert stale_path not in saved["answer"]
        assert session_ws in saved["answer"]

    def test_save_then_load_workspace_roundtrip(self, tmp_path: Path) -> None:
        """Workspace saved by save_step_mode_output is loadable by load_session_dir_inputs."""
        from massgen.step_mode import load_session_dir_inputs, save_step_mode_output

        ws = tmp_path / "workspace_src"
        ws.mkdir()
        (ws / "index.html").write_text("<html>test</html>")

        session_dir = tmp_path / "session"
        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text="My answer",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=5.0,
            workspace_source=str(ws),
        )

        inputs = load_session_dir_inputs(str(session_dir))
        assert inputs.virtual_agents["agent_a"].latest_workspace is not None
        assert (Path(inputs.virtual_agents["agent_a"].latest_workspace) / "index.html").exists()

    def test_save_workspace_path_in_last_action(self, tmp_path: Path) -> None:
        """last_action.json includes workspace_path when workspace is copied."""
        from massgen.step_mode import save_step_mode_output

        ws = tmp_path / "workspace_src"
        ws.mkdir()
        (ws / "app.js").write_text("console.log('hi')")

        session_dir = tmp_path / "session"
        step_dir = save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text="Built an app",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=15.0,
            workspace_source=str(ws),
        )

        last_action = json.loads((session_dir / "agents" / "agent_a" / "last_action.json").read_text())
        assert last_action["workspace_path"] == str(step_dir / "workspace")


# ---------------------------------------------------------------------------
# A0.4: Config validation for step mode
# ---------------------------------------------------------------------------


class TestStepModeConfigValidation:
    """Tests for step mode configuration validation."""

    def test_step_mode_requires_single_agent_config(self) -> None:
        """Step mode config must define exactly one agent."""
        from massgen.step_mode import validate_step_mode_config

        # Single agent — valid
        config = {"agents": [{"id": "agent_a", "backend": {"type": "openai", "model": "gpt-5.4"}}]}
        assert validate_step_mode_config(config) is True

        # Multiple agents — invalid
        config_multi = {
            "agents": [
                {"id": "agent_a", "backend": {"type": "openai", "model": "gpt-5.4"}},
                {"id": "agent_b", "backend": {"type": "gemini", "model": "gemini-3-flash"}},
            ],
        }
        with pytest.raises(ValueError, match="exactly one agent"):
            validate_step_mode_config(config_multi)

        # No agents — invalid
        config_none = {"agents": []}
        with pytest.raises(ValueError, match="exactly one agent"):
            validate_step_mode_config(config_none)

    def test_step_mode_accepts_single_agent_key(self) -> None:
        """Step mode also accepts the 'agent' key (single agent shorthand)."""
        from massgen.step_mode import validate_step_mode_config

        config = {"agent": {"id": "agent_a", "backend": {"type": "openai", "model": "gpt-5.4"}}}
        assert validate_step_mode_config(config) is True


# ---------------------------------------------------------------------------
# A0.5: Stale vote detection
# ---------------------------------------------------------------------------


class TestStaleVoteDetection:
    """Tests for detecting stale votes based on seen_steps."""

    def test_fresh_vote_is_valid(self, tmp_path: Path) -> None:
        """A vote that has seen the latest steps is valid."""
        from massgen.step_mode import is_vote_stale

        session_dir = tmp_path / "session"
        _write_answer(session_dir, "agent_a", 1, "A answer")
        _write_answer(session_dir, "agent_b", 1, "B answer")
        _write_vote(session_dir, "agent_a", 2, "agent_b", {"agent_a": 1, "agent_b": 1})

        assert is_vote_stale(str(session_dir), "agent_a", 2) is False

    def test_stale_vote_detected(self, tmp_path: Path) -> None:
        """A vote becomes stale when a new answer arrives after it was cast."""
        from massgen.step_mode import is_vote_stale

        session_dir = tmp_path / "session"
        _write_answer(session_dir, "agent_a", 1, "A v1")
        _write_answer(session_dir, "agent_b", 1, "B v1")
        # agent_a votes having seen agent_b at step 1
        _write_vote(session_dir, "agent_a", 2, "agent_b", {"agent_a": 1, "agent_b": 1})
        # agent_b submits a new answer at step 2
        _write_answer(session_dir, "agent_b", 2, "B v2")

        # agent_a's vote is now stale — it hasn't seen agent_b's step 2
        assert is_vote_stale(str(session_dir), "agent_a", 2) is True

    def test_vote_without_seen_steps_is_stale(self, tmp_path: Path) -> None:
        """A vote without seen_steps field is treated as stale for safety."""
        from massgen.step_mode import is_vote_stale

        session_dir = tmp_path / "session"
        _write_answer(session_dir, "agent_a", 1, "A answer")
        # Write a malformed vote without seen_steps
        step_dir = session_dir / "agents" / "agent_a" / "002"
        step_dir.mkdir(parents=True)
        (step_dir / "vote.json").write_text(
            json.dumps(
                {
                    "voter": "agent_a",
                    "target": "agent_b",
                    "reason": "test",
                },
            ),
        )

        assert is_vote_stale(str(session_dir), "agent_a", 2) is True


# ---------------------------------------------------------------------------
# A0.6: CLI flag parsing
# ---------------------------------------------------------------------------


class TestCLIStepModeFlags:
    """Tests for --step and --session-dir CLI flags."""

    def test_step_flag_parsed(self) -> None:
        """--step flag is recognized by the parser."""
        from massgen.cli import main_parser

        parser = main_parser()
        args = parser.parse_args(["--step", "--session-dir", "/tmp/session", "--config", "test.yaml", "test question"])
        assert args.step is True
        assert args.session_dir == "/tmp/session"

    def test_step_flag_default_false(self) -> None:
        """--step defaults to False when not provided."""
        from massgen.cli import main_parser

        parser = main_parser()
        args = parser.parse_args(["--config", "test.yaml", "test question"])
        assert args.step is False
        assert args.session_dir is None

    def test_step_requires_session_dir(self) -> None:
        """--step without --session-dir should fail validation."""
        from massgen.step_mode import validate_step_mode_args

        # Simulate args
        class Args:
            step = True
            session_dir = None
            config = "test.yaml"

        with pytest.raises(ValueError, match="--session-dir"):
            validate_step_mode_args(Args())

    def test_step_requires_config(self) -> None:
        """--step without --config should fail validation."""
        from massgen.step_mode import validate_step_mode_args

        class Args:
            step = True
            session_dir = "/tmp/session"
            config = None
            backend = None

        with pytest.raises(ValueError, match="--config"):
            validate_step_mode_args(Args())


# ---------------------------------------------------------------------------
# A0.7: Orchestrator wiring — virtual agent answers visible to real agents
# ---------------------------------------------------------------------------


def _make_step_mode_orchestrator(
    session_dir: Path,
    real_agent_id: str = "agent_x",
    virtual_answers: dict[str, list[tuple[int, str]]] | None = None,
) -> Orchestrator:
    """Create a minimal Orchestrator wired for step mode.

    Args:
        session_dir: Session directory path.
        real_agent_id: ID of the single real agent.
        virtual_answers: Map of agent_id -> [(step, answer_text), ...] to pre-populate.

    Returns:
        Orchestrator with step mode enabled and virtual agents loaded.
    """
    from unittest.mock import Mock

    from massgen.agent_config import StepModeConfig
    from massgen.orchestrator import Orchestrator

    # Write virtual answers to session dir
    if virtual_answers:
        for va_id, steps in virtual_answers.items():
            for step_num, answer_text in steps:
                _write_answer(session_dir, va_id, step_num, answer_text)

    # Create a mock agent for the real agent
    mock_agent = Mock()
    mock_agent.backend = Mock()
    mock_agent.backend.filesystem_manager = None
    mock_agent.backend.backend_params = {}

    step_config = StepModeConfig(enabled=True, session_dir=str(session_dir))

    orchestrator = Orchestrator(
        agents={real_agent_id: mock_agent},
        step_mode=step_config,
    )

    return orchestrator


class TestStepModeAnswerVisibility:
    """Tests that virtual agent answers are visible to the real agent."""

    def test_snapshot_includes_virtual_agents(self, tmp_path: Path) -> None:
        """_get_current_answers_snapshot() includes virtual agent answers."""
        session_dir = tmp_path / "session"
        orch = _make_step_mode_orchestrator(
            session_dir,
            real_agent_id="agent_x",
            virtual_answers={
                "agent_a": [(1, "Answer from A")],
                "agent_b": [(1, "Answer from B")],
            },
        )

        snapshot = orch._get_current_answers_snapshot()
        assert "agent_a" in snapshot
        assert snapshot["agent_a"] == "Answer from A"
        assert "agent_b" in snapshot
        assert snapshot["agent_b"] == "Answer from B"

    def test_snapshot_includes_own_prior_answer(self, tmp_path: Path) -> None:
        """Real agent's prior answer from session dir is visible before it submits a new one.

        In step mode, the agent starts fresh each step and should see ALL prior
        answers (including its own) anonymized. This is the whole point of step
        mode — the agent evaluates all work from scratch.
        """
        session_dir = tmp_path / "session"
        orch = _make_step_mode_orchestrator(
            session_dir,
            real_agent_id="agent_a",
            virtual_answers={"agent_a": [(1, "My prior answer from round 1")]},
        )

        # Before the agent submits anything, it should see its own prior answer
        snapshot = orch._get_current_answers_snapshot()
        assert "agent_a" in snapshot
        assert snapshot["agent_a"] == "My prior answer from round 1"

    def test_snapshot_prefers_new_answer_over_prior(self, tmp_path: Path) -> None:
        """When real agent submits a new answer, it replaces the prior session dir answer."""
        session_dir = tmp_path / "session"
        orch = _make_step_mode_orchestrator(
            session_dir,
            real_agent_id="agent_a",
            virtual_answers={"agent_a": [(1, "Old answer from session")]},
        )

        # Simulate the real agent submitting a new answer
        orch.agent_states["agent_a"].answer = "Fresh answer from this step"

        snapshot = orch._get_current_answers_snapshot()
        assert snapshot["agent_a"] == "Fresh answer from this step"

    def test_own_prior_answer_preloaded_in_coordination_tracker(self, tmp_path: Path) -> None:
        """Real agent's own prior answer is in coordination_tracker for anonymization."""
        session_dir = tmp_path / "session"
        orch = _make_step_mode_orchestrator(
            session_dir,
            real_agent_id="agent_a",
            virtual_answers={
                "agent_a": [(1, "My prior answer")],
                "agent_b": [(1, "Peer answer")],
            },
        )

        # Both should be in the tracker
        assert "agent_a" in orch.coordination_tracker.answers_by_agent
        assert "agent_b" in orch.coordination_tracker.answers_by_agent

    def test_snapshot_prefers_real_agent_answer(self, tmp_path: Path) -> None:
        """Real agent's answer takes precedence if same ID appears in session dir."""
        session_dir = tmp_path / "session"
        orch = _make_step_mode_orchestrator(
            session_dir,
            real_agent_id="agent_x",
            virtual_answers={"agent_x": [(1, "Old answer from session")]},
        )

        # Simulate the real agent submitting an answer
        orch.agent_states["agent_x"].answer = "Fresh answer from real agent"

        snapshot = orch._get_current_answers_snapshot()
        assert snapshot["agent_x"] == "Fresh answer from real agent"

    def test_snapshot_excludes_virtual_when_step_mode_off(self, tmp_path: Path) -> None:
        """Without step mode, snapshot only contains real agent answers."""
        from unittest.mock import Mock

        from massgen.orchestrator import Orchestrator

        mock_agent = Mock()
        mock_agent.backend = Mock()
        mock_agent.backend.filesystem_manager = None
        mock_agent.backend.backend_params = {}

        orch = Orchestrator(agents={"agent_x": mock_agent})
        # No step mode — _step_inputs is None
        assert orch._get_current_answers_snapshot() == {}

    def test_virtual_agents_in_coordination_tracker(self, tmp_path: Path) -> None:
        """Virtual agents are registered in coordination_tracker for anonymization."""
        session_dir = tmp_path / "session"
        orch = _make_step_mode_orchestrator(
            session_dir,
            real_agent_id="agent_x",
            virtual_answers={"agent_a": [(1, "Answer A")]},
        )

        # Virtual agent should be in the coordination tracker's agent_ids
        assert "agent_a" in orch.coordination_tracker.agent_ids
        assert "agent_x" in orch.coordination_tracker.agent_ids

    def test_virtual_agents_pre_marked_as_seen(self, tmp_path: Path) -> None:
        """Real agent has virtual agents in known_answer_ids after init."""
        session_dir = tmp_path / "session"
        orch = _make_step_mode_orchestrator(
            session_dir,
            real_agent_id="agent_x",
            virtual_answers={
                "agent_a": [(1, "Answer A")],
                "agent_b": [(1, "Answer B")],
            },
        )

        known = orch.agent_states["agent_x"].known_answer_ids
        assert "agent_a" in known
        assert "agent_b" in known

    def test_snapshot_with_multiple_virtual_steps(self, tmp_path: Path) -> None:
        """Snapshot uses the latest answer from virtual agents with multiple steps."""
        session_dir = tmp_path / "session"
        orch = _make_step_mode_orchestrator(
            session_dir,
            real_agent_id="agent_x",
            virtual_answers={
                "agent_a": [(1, "First draft"), (2, "Revised draft")],
            },
        )

        snapshot = orch._get_current_answers_snapshot()
        assert snapshot["agent_a"] == "Revised draft"


# ---------------------------------------------------------------------------
# A0.8: State machine — multi-agent round transitions
# ---------------------------------------------------------------------------


class TestStepModeStateMachine:
    """End-to-end state machine tests simulating multi-agent step mode rounds.

    State machine:
      Round 1: all agents answer (no prior context)
      Round 2: agents see all answers → vote or submit new answer
      Stale vote: new answer invalidates prior votes
      Consensus: majority of non-stale votes for same target
    """

    def test_round1_all_agents_answer(self, tmp_path: Path) -> None:
        """Round 1: three agents produce initial answers, no votes yet."""
        from massgen.step_mode import load_session_dir_inputs, save_step_mode_output

        session_dir = tmp_path / "session"
        for agent_id in ("agent_a", "agent_b", "agent_c"):
            save_step_mode_output(
                session_dir=str(session_dir),
                agent_id=agent_id,
                action="new_answer",
                answer_text=f"Answer from {agent_id}",
                vote_target=None,
                vote_reason=None,
                seen_steps=None,
                duration_seconds=30.0,
            )

        inputs = load_session_dir_inputs(str(session_dir))
        assert len(inputs.virtual_agents) == 3
        for agent_id in ("agent_a", "agent_b", "agent_c"):
            va = inputs.virtual_agents[agent_id]
            assert va.latest_answer == f"Answer from {agent_id}"
            assert va.latest_step == 1
            assert va.latest_answer_step == 1

    def test_round2_all_agents_vote_consensus(self, tmp_path: Path) -> None:
        """Round 2: all agents vote, majority agrees → consensus."""
        from massgen.step_mode import is_vote_stale, save_step_mode_output

        session_dir = tmp_path / "session"
        # Round 1: all answer
        for aid in ("agent_a", "agent_b", "agent_c"):
            save_step_mode_output(
                session_dir=str(session_dir),
                agent_id=aid,
                action="new_answer",
                answer_text=f"Answer {aid}",
                vote_target=None,
                vote_reason=None,
                seen_steps=None,
                duration_seconds=30.0,
            )
        # Round 2: all vote for agent_b (consensus)
        seen = {"agent_a": 1, "agent_b": 1, "agent_c": 1}
        for aid in ("agent_a", "agent_b", "agent_c"):
            save_step_mode_output(
                session_dir=str(session_dir),
                agent_id=aid,
                action="vote",
                answer_text=None,
                vote_target="agent_b",
                vote_reason="Best answer",
                seen_steps=seen,
                duration_seconds=10.0,
            )

        # All votes are fresh — no new answers since voting
        for aid in ("agent_a", "agent_b", "agent_c"):
            assert is_vote_stale(str(session_dir), aid, 2) is False

    def test_answer_driven_restart_stales_votes(self, tmp_path: Path) -> None:
        """New answer after votes makes those votes stale."""
        from massgen.step_mode import is_vote_stale, save_step_mode_output

        session_dir = tmp_path / "session"
        # Round 1: all answer
        for aid in ("agent_a", "agent_b", "agent_c"):
            save_step_mode_output(
                session_dir=str(session_dir),
                agent_id=aid,
                action="new_answer",
                answer_text=f"Answer {aid}",
                vote_target=None,
                vote_reason=None,
                seen_steps=None,
                duration_seconds=30.0,
            )
        # Round 2: agent_a and agent_b vote, agent_c submits NEW answer
        seen = {"agent_a": 1, "agent_b": 1, "agent_c": 1}
        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="vote",
            answer_text=None,
            vote_target="agent_b",
            vote_reason="Good",
            seen_steps=seen,
            duration_seconds=10.0,
        )
        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_b",
            action="vote",
            answer_text=None,
            vote_target="agent_a",
            vote_reason="Better",
            seen_steps=seen,
            duration_seconds=10.0,
        )
        # agent_c submits new answer instead of voting
        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_c",
            action="new_answer",
            answer_text="Revised answer from C",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=30.0,
        )

        # agent_a and agent_b votes are now stale (they saw agent_c at step 1, now step 2)
        assert is_vote_stale(str(session_dir), "agent_a", 2) is True
        assert is_vote_stale(str(session_dir), "agent_b", 2) is True

    def test_split_votes_no_consensus(self, tmp_path: Path) -> None:
        """All agents vote for different targets → no majority."""
        from massgen.step_mode import (
            is_vote_stale,
            load_session_dir_inputs,
            save_step_mode_output,
        )

        session_dir = tmp_path / "session"
        # Round 1
        for aid in ("agent_a", "agent_b", "agent_c"):
            save_step_mode_output(
                session_dir=str(session_dir),
                agent_id=aid,
                action="new_answer",
                answer_text=f"Answer {aid}",
                vote_target=None,
                vote_reason=None,
                seen_steps=None,
                duration_seconds=30.0,
            )
        # Round 2: each votes for a different agent
        seen = {"agent_a": 1, "agent_b": 1, "agent_c": 1}
        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="vote",
            answer_text=None,
            vote_target="agent_b",
            vote_reason="B is best",
            seen_steps=seen,
            duration_seconds=10.0,
        )
        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_b",
            action="vote",
            answer_text=None,
            vote_target="agent_c",
            vote_reason="C is best",
            seen_steps=seen,
            duration_seconds=10.0,
        )
        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_c",
            action="vote",
            answer_text=None,
            vote_target="agent_a",
            vote_reason="A is best",
            seen_steps=seen,
            duration_seconds=10.0,
        )

        # All votes are fresh (no new answers)
        for aid in ("agent_a", "agent_b", "agent_c"):
            assert is_vote_stale(str(session_dir), aid, 2) is False

        # But no majority — each target has exactly 1 vote
        inputs = load_session_dir_inputs(str(session_dir))
        vote_counts: dict[str, int] = {}
        for va_id, va_state in inputs.virtual_agents.items():
            for step in va_state.steps:
                target = step.data.get("target")
                if step.action == "vote" and target:
                    vote_counts[target] = vote_counts.get(target, 0) + 1
        assert max(vote_counts.values()) == 1  # No majority

    def test_per_agent_last_action(self, tmp_path: Path) -> None:
        """Per-agent last_action.json files are written for parallel safety."""
        from massgen.step_mode import save_step_mode_output

        session_dir = tmp_path / "session"
        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text="Answer A",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=30.0,
        )
        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_b",
            action="new_answer",
            answer_text="Answer B",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=25.0,
        )

        # Per-agent action files exist and have correct agent
        action_a = json.loads((session_dir / "agents" / "agent_a" / "last_action.json").read_text())
        action_b = json.loads((session_dir / "agents" / "agent_b" / "last_action.json").read_text())
        assert action_a["agent_id"] == "agent_a"
        assert action_b["agent_id"] == "agent_b"
        assert action_a["answer_text"] == "Answer A"
        assert action_b["answer_text"] == "Answer B"

    def test_round2_agent_sees_all_prior_answers(self, tmp_path: Path) -> None:
        """In round 2, the real agent sees all round 1 answers (including its own)."""
        session_dir = tmp_path / "session"
        # Round 1: all 3 agents answer
        _write_answer(session_dir, "agent_a", 1, "A round 1 answer")
        _write_answer(session_dir, "agent_b", 1, "B round 1 answer")
        _write_answer(session_dir, "agent_c", 1, "C round 1 answer")

        # Round 2: agent_a is the real agent
        orch = _make_step_mode_orchestrator(
            session_dir,
            real_agent_id="agent_a",
        )

        snapshot = orch._get_current_answers_snapshot()
        assert len(snapshot) == 3
        assert snapshot["agent_a"] == "A round 1 answer"
        assert snapshot["agent_b"] == "B round 1 answer"
        assert snapshot["agent_c"] == "C round 1 answer"

    def test_round2_new_answer_replaces_prior_in_snapshot(self, tmp_path: Path) -> None:
        """When real agent submits new answer, it replaces prior in snapshot."""
        session_dir = tmp_path / "session"
        _write_answer(session_dir, "agent_a", 1, "A round 1")
        _write_answer(session_dir, "agent_b", 1, "B round 1")

        orch = _make_step_mode_orchestrator(session_dir, real_agent_id="agent_a")

        # Before submitting: sees own prior
        assert orch._get_current_answers_snapshot()["agent_a"] == "A round 1"

        # Agent submits new answer
        orch.agent_states["agent_a"].answer = "A round 2 revised"

        # After submitting: new answer takes precedence
        snapshot = orch._get_current_answers_snapshot()
        assert snapshot["agent_a"] == "A round 2 revised"
        assert snapshot["agent_b"] == "B round 1"

    def test_workspace_roundtrip_multi_agent(self, tmp_path: Path) -> None:
        """Workspaces persist and paths are replaced for multiple agents."""
        from massgen.step_mode import load_session_dir_inputs, save_step_mode_output

        session_dir = tmp_path / "session"
        for aid in ("agent_a", "agent_b"):
            ws = tmp_path / f"ws_{aid}"
            ws.mkdir()
            (ws / "index.html").write_text(f"<html>{aid}</html>")

            save_step_mode_output(
                session_dir=str(session_dir),
                agent_id=aid,
                action="new_answer",
                answer_text=f"Built site at {ws}/index.html",
                vote_target=None,
                vote_reason=None,
                seen_steps=None,
                duration_seconds=30.0,
                workspace_source=str(ws),
            )

        inputs = load_session_dir_inputs(str(session_dir))
        for aid in ("agent_a", "agent_b"):
            va = inputs.virtual_agents[aid]
            assert va.latest_workspace is not None
            assert (Path(va.latest_workspace) / "index.html").exists()
            assert (Path(va.latest_workspace) / "index.html").read_text() == f"<html>{aid}</html>"
            # Stale path replaced
            assert f"ws_{aid}" not in (va.latest_answer or "")


# ---------------------------------------------------------------------------
# A0.9: Temp workspace chain — orchestrator workspace path resolution
# ---------------------------------------------------------------------------


class TestStepModeWorkspaceResolution:
    """Tests for the orchestrator-level workspace path resolution in step mode.

    When an agent submits an answer, the orchestrator must resolve the correct
    workspace path to pass to save_step_mode_output(). The chain is:

        agent cwd → save_snapshot() copies to snapshot_storage → clear_workspace()
        → step mode reads snapshot_storage (not empty cwd) → session dir copy

    These tests verify the _step_action_data["workspace_path"] is set correctly
    under various filesystem_manager configurations.
    """

    def test_workspace_path_from_snapshot_storage(self, tmp_path: Path) -> None:
        """When snapshot_storage exists with content, it is preferred over cwd."""
        from unittest.mock import Mock

        from massgen.agent_config import StepModeConfig
        from massgen.orchestrator import Orchestrator

        session_dir = tmp_path / "session"
        session_dir.mkdir(parents=True)

        # Setup snapshot_storage with content (simulates post-save_snapshot state)
        snapshot_dir = tmp_path / "snapshots" / "agent_x"
        snapshot_dir.mkdir(parents=True)
        (snapshot_dir / "index.html").write_text("<html>from snapshot</html>")

        # Setup empty cwd (simulates post-clear_workspace state)
        cwd_dir = tmp_path / "workspace" / "agent_x"
        cwd_dir.mkdir(parents=True)

        mock_agent = Mock()
        mock_fm = Mock()
        mock_fm.snapshot_storage = snapshot_dir
        mock_fm.cwd = cwd_dir
        mock_agent.backend.filesystem_manager = mock_fm
        mock_agent.backend.backend_params = {}

        step_config = StepModeConfig(enabled=True, session_dir=str(session_dir))

        orch = Orchestrator(
            agents={"agent_x": mock_agent},
            step_mode=step_config,
        )

        workspace_path = orch._resolve_step_mode_workspace("agent_x")

        assert workspace_path == str(snapshot_dir)
        assert (Path(workspace_path) / "index.html").exists()

    def test_workspace_path_falls_back_to_cwd(self, tmp_path: Path) -> None:
        """When snapshot_storage is None, cwd with content is used as fallback."""
        from unittest.mock import Mock

        from massgen.agent_config import StepModeConfig
        from massgen.orchestrator import Orchestrator

        session_dir = tmp_path / "session"
        session_dir.mkdir(parents=True)

        cwd_dir = tmp_path / "workspace" / "agent_x"
        cwd_dir.mkdir(parents=True)
        (cwd_dir / "app.js").write_text("console.log('hi')")

        mock_agent = Mock()
        mock_fm = Mock()
        mock_fm.snapshot_storage = None
        mock_fm.cwd = cwd_dir
        mock_agent.backend.filesystem_manager = mock_fm
        mock_agent.backend.backend_params = {}

        step_config = StepModeConfig(enabled=True, session_dir=str(session_dir))

        orch = Orchestrator(
            agents={"agent_x": mock_agent},
            step_mode=step_config,
        )

        workspace_path = orch._resolve_step_mode_workspace("agent_x")

        assert workspace_path == str(cwd_dir)
        assert (Path(workspace_path) / "app.js").exists()

    def test_workspace_path_none_without_filesystem_manager(self, tmp_path: Path) -> None:
        """When agent has no filesystem_manager, workspace_path is None."""
        from unittest.mock import Mock

        from massgen.agent_config import StepModeConfig
        from massgen.orchestrator import Orchestrator

        session_dir = tmp_path / "session"
        session_dir.mkdir(parents=True)

        mock_agent = Mock()
        mock_agent.backend.filesystem_manager = None
        mock_agent.backend.backend_params = {}

        step_config = StepModeConfig(enabled=True, session_dir=str(session_dir))

        orch = Orchestrator(
            agents={"agent_x": mock_agent},
            step_mode=step_config,
        )

        workspace_path = orch._resolve_step_mode_workspace("agent_x")

        assert workspace_path is None

    def test_workspace_path_none_when_snapshot_storage_empty(self, tmp_path: Path) -> None:
        """When snapshot_storage exists but is empty, workspace_path is None.

        setup_orchestration_paths always creates the snapshot_storage directory,
        so it exists even when the agent produced no files. An empty directory
        should not be treated as a workspace — external orchestrators rely on
        workspace_path being None to mean 'no files produced'.
        """
        from unittest.mock import Mock

        from massgen.agent_config import StepModeConfig
        from massgen.orchestrator import Orchestrator

        session_dir = tmp_path / "session"
        session_dir.mkdir(parents=True)

        # Empty snapshot storage (setup_orchestration_paths created it, agent made no files)
        snapshot_dir = tmp_path / "snapshots" / "agent_x"
        snapshot_dir.mkdir(parents=True)

        # cwd is also empty (clear_workspace ran)
        cwd_dir = tmp_path / "workspace" / "agent_x"
        cwd_dir.mkdir(parents=True)

        mock_agent = Mock()
        mock_fm = Mock()
        mock_fm.snapshot_storage = snapshot_dir
        mock_fm.cwd = cwd_dir
        mock_agent.backend.filesystem_manager = mock_fm
        mock_agent.backend.backend_params = {}

        step_config = StepModeConfig(enabled=True, session_dir=str(session_dir))

        orch = Orchestrator(
            agents={"agent_x": mock_agent},
            step_mode=step_config,
        )

        # Simulate the orchestrator workspace resolution logic
        orch._step_complete = True
        workspace_path = orch._resolve_step_mode_workspace("agent_x")

        # Empty snapshot_storage should NOT be reported as a workspace
        assert workspace_path is None


class TestStepModeWorkspaceEndToEnd:
    """End-to-end tests: workspace save → session dir → reload.

    Verifies the full chain from a simulated agent workspace through
    save_step_mode_output to load_session_dir_inputs.
    """

    def test_nested_directory_structure_preserved(self, tmp_path: Path) -> None:
        """Nested directories in workspace are preserved through save/load."""
        from massgen.step_mode import load_session_dir_inputs, save_step_mode_output

        ws = tmp_path / "workspace_src"
        (ws / "src" / "components").mkdir(parents=True)
        (ws / "src" / "components" / "App.tsx").write_text("export const App = () => {}")
        (ws / "src" / "index.ts").write_text("import { App } from './components/App'")
        (ws / "public").mkdir()
        (ws / "public" / "index.html").write_text("<html><body></body></html>")

        session_dir = tmp_path / "session"
        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text="Built a React app",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=60.0,
            workspace_source=str(ws),
        )

        inputs = load_session_dir_inputs(str(session_dir))
        ws_path = Path(inputs.virtual_agents["agent_a"].latest_workspace)
        assert (ws_path / "src" / "components" / "App.tsx").exists()
        assert (ws_path / "src" / "index.ts").exists()
        assert (ws_path / "public" / "index.html").exists()

    def test_workspace_persists_across_multiple_steps(self, tmp_path: Path) -> None:
        """Each step gets its own workspace copy; earlier steps are not overwritten."""
        from massgen.step_mode import load_session_dir_inputs, save_step_mode_output

        session_dir = tmp_path / "session"

        # Step 1: initial workspace
        ws1 = tmp_path / "ws1"
        ws1.mkdir()
        (ws1 / "index.html").write_text("<html>v1</html>")

        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text="Version 1",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=30.0,
            workspace_source=str(ws1),
        )

        # Step 2: updated workspace
        ws2 = tmp_path / "ws2"
        ws2.mkdir()
        (ws2 / "index.html").write_text("<html>v2</html>")
        (ws2 / "style.css").write_text("body { color: red; }")

        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text="Version 2",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=30.0,
            workspace_source=str(ws2),
        )

        # Step 1 workspace is untouched
        ws1_saved = session_dir / "agents" / "agent_a" / "001" / "workspace"
        assert (ws1_saved / "index.html").read_text() == "<html>v1</html>"
        assert not (ws1_saved / "style.css").exists()

        # Step 2 workspace has updated content
        ws2_saved = session_dir / "agents" / "agent_a" / "002" / "workspace"
        assert (ws2_saved / "index.html").read_text() == "<html>v2</html>"
        assert (ws2_saved / "style.css").read_text() == "body { color: red; }"

        # load_session_dir_inputs returns the latest workspace (step 2)
        inputs = load_session_dir_inputs(str(session_dir))
        assert inputs.virtual_agents["agent_a"].latest_workspace == str(ws2_saved)

    def test_vote_step_has_no_workspace(self, tmp_path: Path) -> None:
        """Vote steps don't produce workspace directories."""
        from massgen.step_mode import save_step_mode_output

        session_dir = tmp_path / "session"

        # Step 1: answer with workspace
        ws = tmp_path / "ws"
        ws.mkdir()
        (ws / "app.py").write_text("print('hello')")

        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text="My app",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=30.0,
            workspace_source=str(ws),
        )

        # Step 2: vote (no workspace_source)
        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="vote",
            answer_text=None,
            vote_target="agent_b",
            vote_reason="Better",
            seen_steps={"agent_a": 1, "agent_b": 1},
            duration_seconds=10.0,
        )

        # Vote step directory should NOT have a workspace
        vote_step = session_dir / "agents" / "agent_a" / "002"
        assert not (vote_step / "workspace").exists()
        # But step 1 workspace still exists
        assert (session_dir / "agents" / "agent_a" / "001" / "workspace" / "app.py").exists()

    def test_latest_workspace_tracks_answer_not_vote(self, tmp_path: Path) -> None:
        """latest_workspace points to the most recent answer's workspace, ignoring votes."""
        from massgen.step_mode import load_session_dir_inputs, save_step_mode_output

        session_dir = tmp_path / "session"

        # Step 1: answer with workspace
        ws = tmp_path / "ws"
        ws.mkdir()
        (ws / "main.py").write_text("# main")

        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text="Created main.py",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=30.0,
            workspace_source=str(ws),
        )

        # Steps 2-3: votes (no workspace)
        for i in range(2):
            save_step_mode_output(
                session_dir=str(session_dir),
                agent_id="agent_a",
                action="vote",
                answer_text=None,
                vote_target="agent_b",
                vote_reason=f"Vote {i+1}",
                seen_steps={"agent_a": 1, "agent_b": 1},
                duration_seconds=10.0,
            )

        inputs = load_session_dir_inputs(str(session_dir))
        va = inputs.virtual_agents["agent_a"]
        # latest_workspace should still point to step 1's workspace
        assert va.latest_workspace is not None
        assert (Path(va.latest_workspace) / "main.py").exists()
        assert va.latest_step == 3  # step count includes votes
        assert va.latest_answer_step == 1  # answer step is still 1

    def test_no_workspace_source_means_no_workspace_dir(self, tmp_path: Path) -> None:
        """When no workspace_source is provided, no workspace/ directory is created."""
        from massgen.step_mode import load_session_dir_inputs, save_step_mode_output

        session_dir = tmp_path / "session"

        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text="Text-only answer, no files produced",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=20.0,
            workspace_source=None,
        )

        step_dir = session_dir / "agents" / "agent_a" / "001"
        assert (step_dir / "answer.json").exists()
        assert not (step_dir / "workspace").exists()

        inputs = load_session_dir_inputs(str(session_dir))
        assert inputs.virtual_agents["agent_a"].latest_workspace is None

    def test_workspace_with_binary_files(self, tmp_path: Path) -> None:
        """Binary files in workspace are preserved through save/load."""
        from massgen.step_mode import load_session_dir_inputs, save_step_mode_output

        ws = tmp_path / "workspace_src"
        ws.mkdir()
        # Write a small "binary" file (PNG header)
        png_header = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        (ws / "logo.png").write_bytes(png_header)
        (ws / "index.html").write_text("<html><img src='logo.png'></html>")

        session_dir = tmp_path / "session"
        save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text="Built a page with a logo",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=30.0,
            workspace_source=str(ws),
        )

        inputs = load_session_dir_inputs(str(session_dir))
        ws_path = Path(inputs.virtual_agents["agent_a"].latest_workspace)
        assert (ws_path / "logo.png").read_bytes() == png_header
        assert (ws_path / "index.html").exists()

    def test_workspace_symlinks_copied_as_symlinks(self, tmp_path: Path) -> None:
        """Symlinks in workspace are preserved (copytree with symlinks=True)."""
        from massgen.step_mode import save_step_mode_output

        ws = tmp_path / "workspace_src"
        ws.mkdir()
        (ws / "real_file.txt").write_text("real content")
        (ws / "link_file.txt").symlink_to(ws / "real_file.txt")

        session_dir = tmp_path / "session"
        step_dir = save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text="Has symlinks",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=10.0,
            workspace_source=str(ws),
        )

        ws_dest = step_dir / "workspace"
        assert (ws_dest / "real_file.txt").read_text() == "real content"
        assert (ws_dest / "link_file.txt").is_symlink()

    def test_multiple_agents_independent_workspaces(self, tmp_path: Path) -> None:
        """Different agents' workspaces don't interfere with each other."""
        from massgen.step_mode import load_session_dir_inputs, save_step_mode_output

        session_dir = tmp_path / "session"

        agents_files = {
            "agent_a": {"app.py": "print('A')", "README.md": "Agent A"},
            "agent_b": {"server.js": "const app = express()", "package.json": "{}"},
            "agent_c": {"main.go": "package main", "go.mod": "module test"},
        }

        for aid, files in agents_files.items():
            ws = tmp_path / f"ws_{aid}"
            ws.mkdir()
            for name, content in files.items():
                (ws / name).write_text(content)

            save_step_mode_output(
                session_dir=str(session_dir),
                agent_id=aid,
                action="new_answer",
                answer_text=f"Answer from {aid}",
                vote_target=None,
                vote_reason=None,
                seen_steps=None,
                duration_seconds=30.0,
                workspace_source=str(ws),
            )

        inputs = load_session_dir_inputs(str(session_dir))

        for aid, files in agents_files.items():
            va = inputs.virtual_agents[aid]
            assert va.latest_workspace is not None
            ws_path = Path(va.latest_workspace)
            # Each agent has exactly its own files
            for name, content in files.items():
                assert (ws_path / name).read_text() == content
            # And NOT other agents' files
            for other_aid, other_files in agents_files.items():
                if other_aid != aid:
                    for other_name in other_files:
                        assert not (ws_path / other_name).exists()


# ---------------------------------------------------------------------------
# Bug 2: agent_agent_a double prefix in anonymous labels
# ---------------------------------------------------------------------------


class TestAgentNamingFallback:
    """Tests for the fallback label construction when agent_mapping misses a key."""

    def test_message_template_fallback_no_double_prefix(self) -> None:
        """Fallback for agent_id='agent_a' should produce 'agent_a', not 'agent_agent_a'."""
        from massgen.message_templates import MessageTemplates

        mt = MessageTemplates()
        # agent_mapping deliberately missing 'agent_a' to trigger fallback
        result = mt.format_current_answers_with_summaries(
            agent_summaries={"agent_a": "My answer text"},
            agent_mapping={"agent_b": "agent2"},  # agent_a NOT in mapping
        )
        # Fallback should use raw agent_id, not f"agent_{agent_id}"
        assert "agent_agent_a" not in result
        assert "<agent_a>" in result

    def test_normalize_workspace_paths_fallback_no_double_prefix(self, tmp_path: Path) -> None:
        """_normalize_workspace_paths_in_answers fallback should not double-prefix agent IDs."""
        from unittest.mock import Mock, patch

        from massgen.orchestrator import Orchestrator

        session_dir = tmp_path / "session"
        session_dir.mkdir(parents=True)

        # Create an orchestrator with an agent whose ID starts with 'agent_'
        mock_agent = Mock()
        mock_fm = Mock()
        mock_fm.get_current_workspace.return_value = tmp_path / "workspace"
        mock_fm.agent_temporary_workspace = tmp_path / "temp_ws"
        mock_agent.backend.filesystem_manager = mock_fm
        mock_agent.backend.backend_params = {}

        orch = Orchestrator(agents={"agent_a": mock_agent})

        # Mock the coordination tracker to NOT have the agent in mapping
        with patch.object(orch.coordination_tracker, "get_reverse_agent_mapping", return_value={}):
            result = orch._normalize_workspace_paths_in_answers(
                {"agent_a": f"Files at {tmp_path}/workspace/index.html"},
                viewing_agent_id="agent_a",
            )

        # The fallback should use "agent_a", not "agent_agent_a"
        assert "agent_agent_a" not in result.get("agent_a", "")


# ---------------------------------------------------------------------------
# Bug 1: Stale workspace paths in answer text
# ---------------------------------------------------------------------------


class TestStaleWorkspacePaths:
    """Tests for replacing ALL stale workspace paths (cwd, temp workspace, snapshot_storage)."""

    def test_stale_cwd_path_replaced(self, tmp_path: Path) -> None:
        """When answer text references the agent's original cwd, it gets replaced."""
        from massgen.step_mode import save_step_mode_output

        ws = tmp_path / "snapshot_storage" / "agent_x"
        ws.mkdir(parents=True)
        (ws / "index.html").write_text("<html>test</html>")

        # The agent's answer references its original cwd, NOT the snapshot storage
        original_cwd = str(tmp_path / ".massgen" / "workspaces" / "workspace_80473a78")
        answer_text = f"I created the file at {original_cwd}/index.html"

        session_dir = tmp_path / "session"
        step_dir = save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_x",
            action="new_answer",
            answer_text=answer_text,
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=10.0,
            workspace_source=str(ws),
            stale_workspace_paths=[original_cwd],
        )

        saved = json.loads((step_dir / "answer.json").read_text())
        session_ws = str(step_dir / "workspace")
        # Original cwd path should be replaced
        assert original_cwd not in saved["answer"]
        assert session_ws in saved["answer"]

    def test_multiple_stale_paths_all_replaced(self, tmp_path: Path) -> None:
        """All stale paths (cwd, temp workspace, snapshot_storage) are replaced."""
        from massgen.step_mode import save_step_mode_output

        ws = tmp_path / "snapshot_storage"
        ws.mkdir(parents=True)
        (ws / "file.txt").write_text("content")

        cwd_path = str(tmp_path / "workspaces" / "workspace_abc123")
        temp_ws_path = str(tmp_path / "temp_workspaces" / "agent_x")

        answer_text = f"Created at {cwd_path}/file.txt\n" f"Also accessible at {temp_ws_path}/file.txt\n" f"Snapshot at {ws}/file.txt"

        session_dir = tmp_path / "session"
        step_dir = save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_x",
            action="new_answer",
            answer_text=answer_text,
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=10.0,
            workspace_source=str(ws),
            stale_workspace_paths=[cwd_path, temp_ws_path],
        )

        saved = json.loads((step_dir / "answer.json").read_text())
        session_ws = str(step_dir / "workspace")
        assert cwd_path not in saved["answer"]
        assert temp_ws_path not in saved["answer"]
        # workspace_source is also replaced (existing behavior)
        assert str(ws) not in saved["answer"]
        assert session_ws in saved["answer"]

    def test_stale_paths_none_preserves_existing_behavior(self, tmp_path: Path) -> None:
        """When stale_workspace_paths is None, only workspace_source is replaced (backwards compat)."""
        from massgen.step_mode import save_step_mode_output

        ws = tmp_path / "workspace_src"
        ws.mkdir()
        (ws / "file.txt").write_text("content")

        answer_text = f"File at {ws}/file.txt"

        session_dir = tmp_path / "session"
        step_dir = save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_x",
            action="new_answer",
            answer_text=answer_text,
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=10.0,
            workspace_source=str(ws),
            # stale_workspace_paths not provided — default None
        )

        saved = json.loads((step_dir / "answer.json").read_text())
        session_ws = str(step_dir / "workspace")
        assert str(ws) not in saved["answer"]
        assert session_ws in saved["answer"]

    def test_orchestrator_captures_stale_paths(self, tmp_path: Path) -> None:
        """Orchestrator step mode block captures stale paths from filesystem manager."""
        from unittest.mock import Mock

        from massgen.agent_config import StepModeConfig
        from massgen.orchestrator import Orchestrator

        session_dir = tmp_path / "session"
        session_dir.mkdir(parents=True)

        # Setup filesystem manager paths
        snapshot_dir = tmp_path / "snapshots" / "agent_x"
        snapshot_dir.mkdir(parents=True)
        (snapshot_dir / "index.html").write_text("<html>test</html>")

        cwd_dir = tmp_path / "workspaces" / "workspace_abc"
        cwd_dir.mkdir(parents=True)

        temp_ws_dir = tmp_path / "temp_workspaces" / "agent_x"
        temp_ws_dir.mkdir(parents=True)

        mock_agent = Mock()
        mock_fm = Mock()
        mock_fm.snapshot_storage = snapshot_dir
        mock_fm.cwd = str(cwd_dir)
        mock_fm.agent_temporary_workspace = temp_ws_dir
        mock_agent.backend.filesystem_manager = mock_fm
        mock_agent.backend.backend_params = {}

        step_config = StepModeConfig(enabled=True, session_dir=str(session_dir))
        orch = Orchestrator(agents={"agent_x": mock_agent}, step_mode=step_config)

        # Simulate the step mode workspace resolution + stale path capture
        stale_paths = orch._resolve_step_mode_stale_paths("agent_x")

        assert str(cwd_dir) in stale_paths
        assert str(temp_ws_dir) in stale_paths
        # snapshot_storage itself is the workspace_source, not a stale path


# ---------------------------------------------------------------------------
# Bug 3: Virtual agent workspaces not copied to temp workspace
# ---------------------------------------------------------------------------


class TestVirtualAgentWorkspaceCopying:
    """Tests for including virtual agent workspaces in _copy_all_snapshots_to_temp_workspace."""

    def test_virtual_agent_workspace_included_in_snapshots(self, tmp_path: Path) -> None:
        """In step mode, virtual agent workspaces are included alongside real agent snapshots."""
        from unittest.mock import AsyncMock, Mock

        from massgen.agent_config import StepModeConfig
        from massgen.orchestrator import Orchestrator

        session_dir = tmp_path / "session"
        # Create a virtual agent with a workspace
        _write_answer(session_dir, "agent_a", 1, "Virtual answer")
        va_ws = _write_workspace(session_dir, "agent_a", 1, {"index.html": "<html>virtual</html>"})

        # Create real agent with filesystem manager
        mock_agent = Mock()
        mock_fm = Mock()
        snapshot_base = tmp_path / "snapshots"
        snapshot_base.mkdir(parents=True)
        mock_fm.copy_snapshots_to_temp_workspace = AsyncMock(return_value=tmp_path / "temp_ws")
        mock_agent.backend.filesystem_manager = mock_fm
        mock_agent.backend.backend_params = {}

        step_config = StepModeConfig(enabled=True, session_dir=str(session_dir))
        orch = Orchestrator(agents={"agent_x": mock_agent}, step_mode=step_config)
        orch._snapshot_storage = str(snapshot_base)

        import asyncio

        asyncio.run(
            orch._copy_all_snapshots_to_temp_workspace("agent_x"),
        )

        # Verify copy_snapshots_to_temp_workspace was called with virtual agent workspaces
        call_args = mock_fm.copy_snapshots_to_temp_workspace.call_args
        all_snapshots = call_args[0][0]  # First positional arg
        # Virtual agent's workspace should be in the snapshots
        assert "agent_a" in all_snapshots
        assert str(all_snapshots["agent_a"]) == str(va_ws)


# ---------------------------------------------------------------------------
# Bug 4: Post-coordination artifacts in step mode
# ---------------------------------------------------------------------------


class TestStepModePostCoordinationArtifacts:
    """Tests for step mode post-coordination log artifacts (final/, status.json, etc.)."""

    def test_finalize_step_mode_saves_final_snapshot(self, tmp_path: Path) -> None:
        """finalize_step_mode creates final/{agent_id}/answer.txt."""
        from unittest.mock import Mock

        from massgen.agent_config import StepModeConfig
        from massgen.orchestrator import Orchestrator

        session_dir = tmp_path / "session"
        session_dir.mkdir(parents=True)

        # Setup log session dir
        log_dir = tmp_path / "logs" / "session_123"
        log_dir.mkdir(parents=True)

        mock_agent = Mock()
        mock_fm = Mock()
        mock_fm.snapshot_storage = None
        mock_fm.cwd = None
        mock_fm.agent_temporary_workspace = None
        mock_agent.backend.filesystem_manager = mock_fm
        mock_agent.backend.backend_params = {}

        step_config = StepModeConfig(enabled=True, session_dir=str(session_dir))
        orch = Orchestrator(agents={"agent_x": mock_agent}, step_mode=step_config)

        # Set the step action data as if the agent submitted an answer
        orch._step_action_data = {
            "action": "new_answer",
            "agent_id": "agent_x",
            "answer_text": "My final answer",
            "workspace_path": None,
        }

        orch.finalize_step_mode(log_dir)

        # Check final/agent_x/answer.txt
        final_answer = log_dir / "final" / "agent_x" / "answer.txt"
        assert final_answer.exists()
        assert final_answer.read_text() == "My final answer"

    def test_finalize_step_mode_saves_coordination_events(self, tmp_path: Path) -> None:
        """finalize_step_mode creates coordination_events.json."""
        from unittest.mock import Mock, patch

        from massgen.agent_config import StepModeConfig
        from massgen.orchestrator import Orchestrator

        session_dir = tmp_path / "session"
        session_dir.mkdir(parents=True)

        log_dir = tmp_path / "logs" / "session_456"
        log_dir.mkdir(parents=True)

        mock_agent = Mock()
        mock_agent.backend.filesystem_manager = None
        mock_agent.backend.backend_params = {}

        step_config = StepModeConfig(enabled=True, session_dir=str(session_dir))
        orch = Orchestrator(agents={"agent_x": mock_agent}, step_mode=step_config)
        orch._step_action_data = {
            "action": "new_answer",
            "agent_id": "agent_x",
            "answer_text": "Test answer",
        }

        with patch("massgen.orchestrator.get_log_session_dir", return_value=log_dir):
            orch.finalize_step_mode(log_dir)

        # coordination_events.json should exist
        assert (log_dir / "coordination_events.json").exists()

    def test_finalize_step_mode_sets_final_answer_in_tracker(self, tmp_path: Path) -> None:
        """finalize_step_mode calls set_final_answer on coordination_tracker."""
        from unittest.mock import Mock, patch

        from massgen.agent_config import StepModeConfig
        from massgen.orchestrator import Orchestrator

        session_dir = tmp_path / "session"
        session_dir.mkdir(parents=True)

        log_dir = tmp_path / "logs" / "session_789"
        log_dir.mkdir(parents=True)

        mock_agent = Mock()
        mock_agent.backend.filesystem_manager = None
        mock_agent.backend.backend_params = {}

        step_config = StepModeConfig(enabled=True, session_dir=str(session_dir))
        orch = Orchestrator(agents={"agent_x": mock_agent}, step_mode=step_config)
        orch._step_action_data = {
            "action": "new_answer",
            "agent_id": "agent_x",
            "answer_text": "Final answer text",
        }

        with patch("massgen.orchestrator.get_log_session_dir", return_value=log_dir):
            orch.finalize_step_mode(log_dir)

        # Verify set_final_answer was called on coordination tracker
        assert "agent_x" in orch.coordination_tracker.final_answers
        assert orch.coordination_tracker.final_answers["agent_x"].content == "Final answer text"

    def test_finalize_step_mode_copies_workspace_to_final(self, tmp_path: Path) -> None:
        """finalize_step_mode copies workspace to final/{agent_id}/workspace/."""
        from unittest.mock import Mock, patch

        from massgen.agent_config import StepModeConfig
        from massgen.orchestrator import Orchestrator

        session_dir = tmp_path / "session"
        session_dir.mkdir(parents=True)

        log_dir = tmp_path / "logs" / "session_ws"
        log_dir.mkdir(parents=True)

        # Create a workspace source
        ws = tmp_path / "workspace_src"
        ws.mkdir()
        (ws / "index.html").write_text("<html>final</html>")

        mock_agent = Mock()
        mock_agent.backend.filesystem_manager = None
        mock_agent.backend.backend_params = {}

        step_config = StepModeConfig(enabled=True, session_dir=str(session_dir))
        orch = Orchestrator(agents={"agent_x": mock_agent}, step_mode=step_config)
        orch._step_action_data = {
            "action": "new_answer",
            "agent_id": "agent_x",
            "answer_text": "Built a site",
            "workspace_path": str(ws),
        }

        with patch("massgen.orchestrator.get_log_session_dir", return_value=log_dir):
            orch.finalize_step_mode(log_dir)

        final_ws = log_dir / "final" / "agent_x" / "workspace"
        assert final_ws.is_dir()
        assert (final_ws / "index.html").read_text() == "<html>final</html>"

    def test_finalize_step_mode_vote_no_final_dir(self, tmp_path: Path) -> None:
        """finalize_step_mode with a vote action doesn't create final/ with answer."""
        from unittest.mock import Mock, patch

        from massgen.agent_config import StepModeConfig
        from massgen.orchestrator import Orchestrator

        session_dir = tmp_path / "session"
        session_dir.mkdir(parents=True)

        log_dir = tmp_path / "logs" / "session_vote"
        log_dir.mkdir(parents=True)

        mock_agent = Mock()
        mock_agent.backend.filesystem_manager = None
        mock_agent.backend.backend_params = {}

        step_config = StepModeConfig(enabled=True, session_dir=str(session_dir))
        orch = Orchestrator(agents={"agent_x": mock_agent}, step_mode=step_config)
        orch._step_action_data = {
            "action": "vote",
            "agent_id": "agent_x",
            "vote_target": "agent_a",
            "vote_reason": "Better",
        }

        with patch("massgen.orchestrator.get_log_session_dir", return_value=log_dir):
            orch.finalize_step_mode(log_dir)

        # No final answer file for vote-only actions
        assert not (log_dir / "final" / "agent_x" / "answer.txt").exists()
        # But coordination_events.json should still exist
        assert (log_dir / "coordination_events.json").exists()
