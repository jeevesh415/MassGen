"""MassGen Step Mode — run one agent for one step, then exit.

Step mode is a building block for external orchestrators. It:
- Loads prior answers/workspaces from a session directory
- Runs a single configured agent for one iteration
- The agent sees prior answers as native peer context
- Terminates after the agent calls new_answer or vote
- Writes the action + updated state back to the session directory

The session directory is source-agnostic: massgen doesn't care whether
prior answers came from other massgen runs, Claude Code, or a shell script.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class VirtualAgentState:
    """State of a virtual agent loaded from the session directory."""

    agent_id: str
    latest_step: int
    latest_answer: str | None = None
    latest_answer_step: int | None = None
    latest_workspace: str | None = None
    steps: list[StepRecord] = field(default_factory=list)


@dataclass
class StepRecord:
    """Record of a single step (answer or vote) from the session dir."""

    step_num: int
    action: str  # "new_answer" or "vote"
    data: dict[str, Any] = field(default_factory=dict)
    workspace_path: str | None = None


@dataclass
class SessionDirInputs:
    """Parsed inputs from a session directory."""

    virtual_agents: dict[str, VirtualAgentState] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Session directory loading
# ---------------------------------------------------------------------------


def load_session_dir_inputs(session_dir: str) -> SessionDirInputs:
    """Load virtual agent state from a session directory.

    Scans session_dir/agents/*/ for answer.json and vote.json files.
    Each agent's latest answer (highest-numbered step with answer.json)
    is loaded as peer context. Votes are tracked but not loaded as context.

    Args:
        session_dir: Path to session directory.

    Returns:
        SessionDirInputs with virtual agent states.
    """
    session_path = Path(session_dir)
    agents_dir = session_path / "agents"

    if not agents_dir.exists():
        return SessionDirInputs()

    virtual_agents: dict[str, VirtualAgentState] = {}

    for agent_dir in sorted(agents_dir.iterdir()):
        if not agent_dir.is_dir():
            continue

        agent_id = agent_dir.name
        steps: list[StepRecord] = []
        latest_answer: str | None = None
        latest_answer_step: int | None = None
        latest_workspace: str | None = None
        latest_step = 0

        # Scan numbered step subdirectories
        step_dirs = sorted(
            [d for d in agent_dir.iterdir() if d.is_dir() and d.name.isdigit()],
            key=lambda d: int(d.name),
        )

        for step_dir in step_dirs:
            step_num = int(step_dir.name)
            latest_step = max(latest_step, step_num)

            answer_file = step_dir / "answer.json"
            vote_file = step_dir / "vote.json"
            workspace_dir = step_dir / "workspace"

            ws_path = str(workspace_dir) if workspace_dir.is_dir() else None

            if answer_file.exists():
                try:
                    data = json.loads(answer_file.read_text())
                    steps.append(
                        StepRecord(
                            step_num=step_num,
                            action="new_answer",
                            data=data,
                            workspace_path=ws_path,
                        ),
                    )
                    latest_answer = data.get("answer", "")
                    latest_answer_step = step_num
                    if ws_path:
                        latest_workspace = ws_path
                except (json.JSONDecodeError, KeyError) as e:
                    logger.warning("Failed to parse %s: %s", answer_file, e)

            elif vote_file.exists():
                try:
                    data = json.loads(vote_file.read_text())
                    steps.append(
                        StepRecord(
                            step_num=step_num,
                            action="vote",
                            data=data,
                        ),
                    )
                except (json.JSONDecodeError, KeyError) as e:
                    logger.warning("Failed to parse %s: %s", vote_file, e)

        if steps or latest_step > 0:
            virtual_agents[agent_id] = VirtualAgentState(
                agent_id=agent_id,
                latest_step=latest_step,
                latest_answer=latest_answer,
                latest_answer_step=latest_answer_step,
                latest_workspace=latest_workspace,
                steps=steps,
            )

    return SessionDirInputs(virtual_agents=virtual_agents)


# ---------------------------------------------------------------------------
# Step mode output writing
# ---------------------------------------------------------------------------


def save_step_mode_output(
    session_dir: str,
    agent_id: str,
    action: str,
    answer_text: str | None,
    vote_target: str | None,
    vote_reason: str | None,
    seen_steps: dict[str, int] | None,
    duration_seconds: float,
    cost: dict[str, Any] | None = None,
    workspace_source: str | None = None,
    stale_workspace_paths: list[str] | None = None,
) -> Path:
    """Write step mode output to the session directory.

    Creates the next numbered step directory for the agent and writes
    either answer.json or vote.json. Also writes last_action.json
    at the session root.

    Args:
        session_dir: Path to session directory.
        agent_id: The agent's anonymous ID.
        action: "new_answer" or "vote".
        answer_text: The answer content (if action is "new_answer").
        vote_target: The target agent ID (if action is "vote").
        vote_reason: The reason for the vote (if action is "vote").
        seen_steps: Map of agent_id -> step_num the voter had seen.
        duration_seconds: How long this step took.
        cost: Token usage and cost info.
        workspace_source: Path to workspace to copy (if action is "new_answer").
        stale_workspace_paths: Additional paths that may appear in answer_text
            (e.g., agent cwd, temp workspace) that should be replaced with the
            session dir workspace path. These are paths the agent referenced during
            execution that won't exist when the session is loaded later.

    Returns:
        Path to the created step directory.
    """
    session_path = Path(session_dir)
    agent_dir = session_path / "agents" / agent_id
    agent_dir.mkdir(parents=True, exist_ok=True)

    # Find next step number
    existing_steps = [int(d.name) for d in agent_dir.iterdir() if d.is_dir() and d.name.isdigit()]
    next_step = max(existing_steps, default=0) + 1

    step_dir = agent_dir / f"{next_step:03d}"
    step_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).isoformat()

    ws_dest_str = None
    if action == "new_answer":
        # Copy workspace if provided
        if workspace_source:
            import shutil

            ws_dest = step_dir / "workspace"
            if Path(workspace_source).is_dir():
                shutil.copytree(workspace_source, ws_dest, symlinks=True, dirs_exist_ok=True)
                ws_dest_str = str(ws_dest)

                # Replace stale paths inside copied workspace files
                from massgen.filesystem_manager import replace_stale_paths_in_workspace

                file_replacements: dict[str, str] = {workspace_source: ws_dest_str}
                if stale_workspace_paths:
                    for sp in stale_workspace_paths:
                        if sp:
                            file_replacements[sp] = ws_dest_str
                replace_stale_paths_in_workspace(ws_dest, file_replacements)

                # Replace stale workspace paths in answer text
                if answer_text:
                    # Replace additional stale paths (cwd, temp workspace, etc.)
                    if stale_workspace_paths:
                        for stale_path in stale_workspace_paths:
                            if stale_path:
                                answer_text = answer_text.replace(stale_path, ws_dest_str)
                    # Replace workspace_source path (snapshot_storage)
                    answer_text = answer_text.replace(workspace_source, ws_dest_str)

        answer_data = {
            "agent_id": agent_id,
            "answer": answer_text or "",
            "timestamp": timestamp,
        }
        (step_dir / "answer.json").write_text(json.dumps(answer_data, indent=2))

    elif action == "vote":
        vote_data = {
            "voter": agent_id,
            "target": vote_target or "",
            "reason": vote_reason or "",
            "seen_steps": seen_steps or {},
            "timestamp": timestamp,
        }
        (step_dir / "vote.json").write_text(json.dumps(vote_data, indent=2))

    # Write action metadata
    last_action = {
        "agent_id": agent_id,
        "action": action,
        "answer_text": answer_text,
        "vote_target": vote_target,
        "vote_reason": vote_reason,
        "timestamp": timestamp,
        "step_number": next_step,
        "duration_seconds": duration_seconds,
        "cost": cost or {},
        "workspace_path": ws_dest_str,
    }
    # Per-agent action file only — no global last_action.json to avoid
    # race conditions when multiple agents run in parallel
    (agent_dir / "last_action.json").write_text(json.dumps(last_action, indent=2))

    return step_dir


# ---------------------------------------------------------------------------
# Stale vote detection
# ---------------------------------------------------------------------------


def _get_latest_answer_steps(session_dir: str) -> dict[str, int]:
    """Get the latest answer step number for each agent.

    Returns a dict mapping agent_id -> highest step number that contains
    an answer.json (not a vote.json).
    """
    inputs = load_session_dir_inputs(session_dir)
    result: dict[str, int] = {}
    for agent_id, state in inputs.virtual_agents.items():
        if state.latest_answer_step is not None:
            result[agent_id] = state.latest_answer_step
    return result


def is_vote_stale(session_dir: str, voter_id: str, vote_step: int) -> bool:
    """Check if a vote is stale based on seen_steps.

    A vote is stale if any agent has a newer answer than what the voter
    saw when casting the vote.

    Args:
        session_dir: Path to session directory.
        voter_id: The voter's agent ID.
        vote_step: The step number of the vote.

    Returns:
        True if the vote is stale, False if still valid.
    """
    session_path = Path(session_dir)
    vote_file = session_path / "agents" / voter_id / f"{vote_step:03d}" / "vote.json"

    if not vote_file.exists():
        return True

    try:
        vote_data = json.loads(vote_file.read_text())
    except (json.JSONDecodeError, KeyError):
        return True

    seen_steps = vote_data.get("seen_steps")
    if not seen_steps:
        return True

    # Compare seen_steps against current state
    current_answer_steps = _get_latest_answer_steps(session_dir)

    for agent_id, current_step in current_answer_steps.items():
        seen = seen_steps.get(agent_id, 0)
        if current_step > seen:
            return True

    return False


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def validate_step_mode_config(config: dict[str, Any]) -> bool:
    """Validate that a config is suitable for step mode.

    Step mode requires exactly one agent definition.

    Args:
        config: Parsed YAML/JSON config dict.

    Returns:
        True if valid.

    Raises:
        ValueError: If config has != 1 agent.
    """
    # Handle both "agents" list and "agent" single-agent shorthand
    if "agent" in config and "agents" not in config:
        return True

    agents = config.get("agents", [])
    if len(agents) != 1:
        raise ValueError(
            f"Step mode requires exactly one agent in config, got {len(agents)}. " "Each step mode invocation manages a single backend.",
        )
    return True


def validate_step_mode_args(args: Any) -> None:
    """Validate CLI arguments for step mode.

    Args:
        args: Parsed argparse namespace.

    Raises:
        ValueError: If required args are missing.
    """
    if not getattr(args, "step", False):
        return

    if not getattr(args, "session_dir", None):
        raise ValueError("--step requires --session-dir to specify the session directory")

    if not getattr(args, "config", None) and not getattr(args, "backend", None):
        raise ValueError("--step requires --config to specify the agent configuration")
