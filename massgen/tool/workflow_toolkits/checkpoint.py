"""
Checkpoint toolkit for MassGen checkpoint coordination mode.

The checkpoint tool allows the main agent to delegate tasks to
the multi-agent team for collaborative execution.
"""

from typing import Any

from .base import BaseToolkit, ToolType

_GATED_ACTIONS_SCHEMA = {
    "type": "array",
    "description": (
        "Restricted tools that agents should propose in their answers "
        "rather than execute directly. Use for tools requiring approval "
        "or that are expensive/irreversible. "
        "Each entry: {tool: 'tool_name', description: 'what it does'}. "
        "Can be empty if no tools need gating."
    ),
    "items": {
        "type": "object",
        "properties": {
            "tool": {
                "type": "string",
                "description": "Tool name (e.g., 'mcp__vercel__deploy')",
            },
            "description": {
                "type": "string",
                "description": "What the tool does",
            },
        },
        "required": ["tool", "description"],
    },
}

_EVAL_CRITERIA_SCHEMA = {
    "type": "array",
    "description": (
        "Evaluation criteria the team should use to judge quality of their work. "
        "Each criterion is a string describing what good output looks like. "
        "These become the checklist agents evaluate against before submitting."
    ),
    "items": {"type": "string"},
    "minItems": 1,
}

_PERSONAS_SCHEMA = {
    "type": "object",
    "description": (
        "Optional agent personas for role assignment. "
        "Dict of agent_id -> persona text. Each persona gives an agent "
        "a distinct perspective or expertise area. If omitted, agents "
        "work without specific role assignments."
    ),
    "additionalProperties": {"type": "string"},
}

_CHECKPOINT_DESCRIPTION = (
    "Delegate a task to the multi-agent team for collaborative "
    "execution. All configured agents activate and work on the "
    "task using standard coordination (iterate, refine, vote). "
    "The consensus result and workspace changes sync back to you."
)

_PROPERTIES = {
    "task": {
        "type": "string",
        "description": "What agents should accomplish",
    },
    "eval_criteria": _EVAL_CRITERIA_SCHEMA,
    "context": {
        "type": "string",
        "description": "Background info, prior work, constraints",
    },
    "personas": _PERSONAS_SCHEMA,
    "gated_actions": _GATED_ACTIONS_SCHEMA,
}

_REQUIRED = ["task", "eval_criteria"]


class CheckpointToolkit(BaseToolkit):
    """Checkpoint toolkit for main agent task delegation."""

    @property
    def toolkit_id(self) -> str:
        return "checkpoint"

    @property
    def toolkit_type(self) -> ToolType:
        return ToolType.WORKFLOW

    def is_enabled(self, config: dict[str, Any]) -> bool:
        return config.get("checkpoint_mode", False)

    def get_tools(self, config: dict[str, Any]) -> list[dict[str, Any]]:
        api_format = config.get("api_format", "chat_completions")

        if api_format == "claude":
            return [self._build_claude_format()]
        elif api_format == "response":
            return [self._build_response_format()]
        else:
            return [self._build_chat_completions_format()]

    def _build_claude_format(self) -> dict[str, Any]:
        return {
            "name": "checkpoint",
            "description": _CHECKPOINT_DESCRIPTION,
            "input_schema": {
                "type": "object",
                "properties": _PROPERTIES,
                "required": _REQUIRED,
            },
        }

    def _build_response_format(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": "checkpoint",
                "description": _CHECKPOINT_DESCRIPTION,
                "parameters": {
                    "type": "object",
                    "properties": _PROPERTIES,
                    "required": _REQUIRED,
                },
            },
        }

    def _build_chat_completions_format(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": "checkpoint",
                "description": _CHECKPOINT_DESCRIPTION,
                "parameters": {
                    "type": "object",
                    "properties": _PROPERTIES,
                    "required": _REQUIRED,
                },
            },
        }
