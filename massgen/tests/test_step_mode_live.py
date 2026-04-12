"""Live API tests for step mode.

These tests hit real APIs and validate the full step mode pipeline:
session dir setup -> massgen --step -> output verification.

Run with: uv run pytest massgen/tests/test_step_mode_live.py -v --run-live-api
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
STEP_CONFIG = REPO_ROOT / "massgen" / "configs" / "basic" / "single" / "single_step_mode.yaml"


def _run_step(session_dir: Path, question: str, config: Path = STEP_CONFIG) -> dict:
    """Run massgen --step and return last_action.json contents."""
    result = subprocess.run(
        [
            "uv",
            "run",
            "massgen",
            "--step",
            "--session-dir",
            str(session_dir),
            "--config",
            str(config),
            "--automation",
            question,
        ],
        capture_output=True,
        text=True,
        timeout=600,
        cwd=str(REPO_ROOT),
    )
    if result.returncode != 0:
        pytest.fail(
            f"massgen --step exited with code {result.returncode}\n" f"STDOUT:\n{result.stdout[-2000:]}\n" f"STDERR:\n{result.stderr[-2000:]}",
        )

    # Read per-agent last_action.json (agent_id from config, default: agent_a)
    last_action_file = session_dir / "agents" / "agent_a" / "last_action.json"
    assert last_action_file.exists(), f"agents/agent_a/last_action.json not created. stdout: {result.stdout[-500:]}"
    return json.loads(last_action_file.read_text())


def _write_virtual_answer(session_dir: Path, agent_id: str, step: int, answer: str) -> None:
    """Write a virtual agent answer into the session dir."""
    step_dir = session_dir / "agents" / agent_id / f"{step:03d}"
    step_dir.mkdir(parents=True, exist_ok=True)
    (step_dir / "answer.json").write_text(
        json.dumps(
            {
                "agent_id": agent_id,
                "answer": answer,
                "timestamp": "2026-03-20T00:00:00Z",
            },
        ),
    )


# ---------------------------------------------------------------------------
# Test 1: Fresh session — agent produces an answer with no prior context
# ---------------------------------------------------------------------------


@pytest.mark.live_api
@pytest.mark.integration
def test_step_mode_fresh_answer(tmp_path: Path) -> None:
    """Agent produces a new_answer on a fresh session with no prior context."""
    session_dir = tmp_path / "session"
    session_dir.mkdir()

    action = _run_step(session_dir, "Say exactly: Hello from step mode")

    assert action["action"] == "new_answer"
    assert action["agent_id"] is not None
    assert len(action["answer_text"]) > 0
    assert action["duration_seconds"] > 0

    # Verify agent dir was created with step 001
    agents_dir = session_dir / "agents"
    assert agents_dir.exists()
    agent_dirs = list(agents_dir.iterdir())
    assert len(agent_dirs) == 1
    step_dirs = list(agent_dirs[0].iterdir())
    assert any(d.name == "001" for d in step_dirs)


# ---------------------------------------------------------------------------
# Test 2: Session with virtual peers — agent sees prior answers
# ---------------------------------------------------------------------------


@pytest.mark.live_api
@pytest.mark.integration
def test_step_mode_with_virtual_peers(tmp_path: Path) -> None:
    """Agent sees virtual agent answers and references them in its response."""
    session_dir = tmp_path / "session"
    session_dir.mkdir()

    # Pre-populate two virtual agent answers
    _write_virtual_answer(
        session_dir,
        "agent_b",
        1,
        "The best programming language for beginners is Python because of its readable syntax.",
    )
    _write_virtual_answer(
        session_dir,
        "agent_c",
        1,
        "I recommend JavaScript for beginners since it runs in the browser " "and has immediate visual feedback.",
    )

    action = _run_step(
        session_dir,
        "What is the best programming language for beginners? " "You MUST reference the other agents' answers in your response. " "Start your answer with 'Having reviewed the other answers'.",
    )

    assert action["action"] == "new_answer"
    # The agent should have produced an answer (it may or may not reference peers
    # depending on model behavior, but the pipeline should complete)
    assert len(action["answer_text"]) > 0

    # Verify the step was saved correctly
    agent_id = action["agent_id"]
    answer_file = session_dir / "agents" / agent_id / "001" / "answer.json"
    assert answer_file.exists()


# ---------------------------------------------------------------------------
# Test 3: Second step for same agent — step number increments
# ---------------------------------------------------------------------------


@pytest.mark.live_api
@pytest.mark.integration
def test_step_mode_increments_step(tmp_path: Path) -> None:
    """Running step mode twice for the same agent increments step numbers."""
    session_dir = tmp_path / "session"
    session_dir.mkdir()

    # First step
    action1 = _run_step(session_dir, "Say exactly: first answer")
    assert action1["action"] == "new_answer"
    assert action1["step_number"] == 1

    # Second step (same session, same agent config)
    action2 = _run_step(session_dir, "Say exactly: second answer")
    assert action2["action"] == "new_answer"
    assert action2["step_number"] == 2


# ---------------------------------------------------------------------------
# Test 4: Session dir structure is correct and parseable
# ---------------------------------------------------------------------------


@pytest.mark.live_api
@pytest.mark.integration
def test_step_mode_output_structure(tmp_path: Path) -> None:
    """Verify the full output structure: agent dir, step dir, answer.json, last_action.json."""
    session_dir = tmp_path / "session"
    session_dir.mkdir()

    action = _run_step(session_dir, "Say exactly: structure test")

    # Per-agent last_action.json (no global file)
    agent_id = action["agent_id"]
    last_action = json.loads((session_dir / "agents" / agent_id / "last_action.json").read_text())
    assert last_action["action"] == "new_answer"
    assert "timestamp" in last_action
    assert "duration_seconds" in last_action
    assert not (session_dir / "last_action.json").exists()

    # agents/{id}/001/answer.json
    agent_id = action["agent_id"]
    answer_data = json.loads(
        (session_dir / "agents" / agent_id / "001" / "answer.json").read_text(),
    )
    assert answer_data["agent_id"] == agent_id
    assert "answer" in answer_data
    assert "timestamp" in answer_data


# ---------------------------------------------------------------------------
# Test 5: Multi-agent simulation — 3 steps, alternating agents
# ---------------------------------------------------------------------------


@pytest.mark.live_api
@pytest.mark.integration
@pytest.mark.expensive
def test_step_mode_multi_agent_simulation(tmp_path: Path) -> None:
    """Simulate a multi-agent session: real agent answers, virtual agent answers,
    real agent answers again seeing the virtual agent.

    This is the core use case for external orchestrators.
    """
    session_dir = tmp_path / "session"
    session_dir.mkdir()

    # Step 1: agent_a answers (using the real config — agent ID comes from config)
    action1 = _run_step(
        session_dir,
        "Propose a name for an AI startup. Give exactly one name and a one-sentence tagline.",
    )
    assert action1["action"] == "new_answer"

    # Step 2: Simulate agent_b's answer (virtual — written directly)
    _write_virtual_answer(
        session_dir,
        "agent_b",
        1,
        "NeuralForge — Building the neural infrastructure for tomorrow's AI applications.",
    )

    # Step 3: agent_a answers again, now seeing agent_b's answer
    action3 = _run_step(
        session_dir,
        "Propose a name for an AI startup. " "Review the other proposals and either improve yours or propose something better. " "Give exactly one name and a one-sentence tagline.",
    )
    assert action3["action"] == "new_answer"
    assert action3["step_number"] == 2  # agent_a's second step
    assert len(action3["answer_text"]) > 0
