"""
Checkpoint MCP Server for MassGen.

Provides the `checkpoint` tool that allows the main agent to delegate
tasks to the multi-agent team for collaborative execution.

The checkpoint tool produces a signal file that the orchestrator detects
to switch from solo mode to checkpoint mode.
"""

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Module-level globals (set during server creation)
_workspace_path: Path | None = None
_agent_id: str | None = None
_gated_patterns: list[str] | None = None

CHECKPOINT_SIGNAL_FILE = ".massgen_checkpoint_signal.json"


def validate_checkpoint_params(
    task: str,
    context: str = "",
    expected_actions: list[dict[str, Any]] | None = None,
    eval_criteria: list[str] | None = None,
    personas: dict[str, str] | None = None,
    gated_actions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Validate checkpoint tool parameters.

    Args:
        task: What agents should accomplish (required, non-empty).
        context: Background info, prior work, constraints.
        expected_actions: DEPRECATED — use gated_actions instead.
        eval_criteria: Evaluation criteria for the checkpoint round (required, non-empty).
        personas: Optional dict of agent_id -> persona text for role assignment.
        gated_actions: Tools that are gated (agents must propose, not execute directly).
            Each entry: {"tool": "tool_name", "description": "what it does"}.

    Returns:
        Validated parameter dict.

    Raises:
        ValueError: If parameters are invalid.
    """
    if not task or not task.strip():
        raise ValueError("task is required and must be non-empty")

    # eval_criteria is required and must be non-empty
    if not eval_criteria:
        raise ValueError("eval_criteria is required and must be a non-empty list")

    # Merge expected_actions into gated_actions for backward compat
    resolved_gated = gated_actions or expected_actions or []

    if resolved_gated:
        for i, action in enumerate(resolved_gated):
            if "tool" not in action:
                raise ValueError(
                    f"gated_actions[{i}] must have a 'tool' field",
                )

    return {
        "task": task.strip(),
        "context": context or "",
        "eval_criteria": list(eval_criteria),
        "personas": dict(personas) if personas else {},
        "gated_actions": resolved_gated,
        # Keep expected_actions for backward compat with existing code
        "expected_actions": resolved_gated,
    }


def build_checkpoint_signal(
    task: str,
    context: str = "",
    expected_actions: list[dict[str, Any]] | None = None,
    eval_criteria: list[str] | None = None,
    personas: dict[str, str] | None = None,
    gated_actions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a checkpoint signal dict for orchestrator detection.

    Args:
        task: What agents should accomplish.
        context: Background info.
        expected_actions: DEPRECATED — use gated_actions.
        eval_criteria: Evaluation criteria for the checkpoint round.
        personas: Optional dict of agent_id -> persona text.
        gated_actions: Gated tools agents should propose rather than execute.

    Returns:
        Signal dict with type, task, context, eval_criteria, personas, gated_actions.
    """
    resolved_gated = gated_actions or expected_actions or []
    return {
        "type": "checkpoint",
        "task": task,
        "context": context or "",
        "eval_criteria": list(eval_criteria) if eval_criteria else [],
        "personas": dict(personas) if personas else {},
        "gated_actions": resolved_gated,
        # Keep expected_actions for backward compat
        "expected_actions": resolved_gated,
    }


def write_checkpoint_signal(
    signal: dict[str, Any],
    workspace: Path,
) -> Path:
    """Write checkpoint signal to workspace for orchestrator detection.

    Args:
        signal: The checkpoint signal dict.
        workspace: Workspace directory path.

    Returns:
        Path to the written signal file.
    """
    workspace.mkdir(parents=True, exist_ok=True)
    signal_file = workspace / CHECKPOINT_SIGNAL_FILE
    signal_file.write_text(json.dumps(signal, indent=2))
    logger.info(f"[Checkpoint] Wrote signal to {signal_file}")
    return signal_file


def format_checkpoint_result(
    consensus: str,
    workspace_changes: list[dict[str, str]],
    action_results: list[dict[str, Any]],
) -> dict[str, Any]:
    """Format checkpoint result for return to the main agent.

    Args:
        consensus: The winning answer text from checkpoint coordination.
        workspace_changes: List of file changes (file, change type).
        action_results: Results of executed proposed_actions.

    Returns:
        Formatted result dict.
    """
    return {
        "consensus": consensus,
        "workspace_changes": workspace_changes,
        "action_results": action_results,
    }


async def create_server():
    """Factory function to create the checkpoint MCP server."""
    import argparse

    import fastmcp

    global _workspace_path, _agent_id, _gated_patterns

    parser = argparse.ArgumentParser(description="Checkpoint MCP Server")
    parser.add_argument("--workspace-path", type=str, required=True)
    parser.add_argument("--agent-id", type=str, required=True)
    parser.add_argument("--gated-patterns", type=str, default="[]")
    parser.add_argument("--hook-dir", type=str, default=None)
    args = parser.parse_args()

    _workspace_path = Path(args.workspace_path)
    _agent_id = args.agent_id
    _gated_patterns = json.loads(args.gated_patterns)

    mcp = fastmcp.FastMCP("massgen_checkpoint")

    @mcp.tool()
    def checkpoint(
        task: str,
        eval_criteria: list[str],
        context: str = "",
        personas: dict[str, str] | None = None,
        gated_actions: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Delegate a task to the multi-agent team for collaborative execution.

        All configured agents activate and work on the task using standard
        coordination (iterate, refine, vote). The consensus result and any
        workspace changes sync back to you.

        Args:
            task: What agents should accomplish (required).
            eval_criteria: Evaluation criteria the team should use to judge quality.
                Each criterion is a string describing what good output looks like.
            context: Background info, prior work, constraints.
            personas: Optional agent personas. Dict of agent_id -> persona text.
                Each persona gives an agent a distinct role/perspective.
            gated_actions: Restricted tools agents should propose in their answers
                rather than execute directly. Each entry:
                {"tool": "tool_name", "description": "what it does"}.
                Use for tools that require approval or are expensive.

        Returns:
            Dict with consensus, workspace_changes, and action_results.
        """
        try:
            params = validate_checkpoint_params(
                task,
                context,
                eval_criteria=eval_criteria,
                personas=personas,
                gated_actions=gated_actions,
            )
        except ValueError as e:
            return {
                "success": False,
                "operation": "checkpoint",
                "error": str(e),
            }

        signal = build_checkpoint_signal(
            task=params["task"],
            context=params["context"],
            eval_criteria=params["eval_criteria"],
            personas=params["personas"],
            gated_actions=params["gated_actions"],
        )

        write_checkpoint_signal(signal, _workspace_path)

        return {
            "success": True,
            "operation": "checkpoint",
            "message": (f"Checkpoint delegated: {params['task'][:100]}. " "All agents are now working on this task. " "Results will be returned when consensus is reached."),
            "signal": signal,
        }

    return mcp


if __name__ == "__main__":
    import asyncio

    import fastmcp

    asyncio.run(fastmcp.run(create_server))
