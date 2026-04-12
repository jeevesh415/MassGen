"""
New Answer toolkit for MassGen workflow coordination.
"""

from typing import Any

from .base import BaseToolkit, ToolType

# Schema for proposed_actions parameter (checkpoint context only)
_PROPOSED_ACTIONS_SCHEMA = {
    "type": "array",
    "description": (
        "Optional list of tool calls to propose for execution after consensus. "
        "Use this to propose gated actions (e.g., deploy, delete) that require "
        "team approval. Each action: {tool, arguments, justification}."
    ),
    "items": {
        "type": "object",
        "properties": {
            "tool": {
                "type": "string",
                "description": "Tool name (e.g., 'mcp__vercel__deploy')",
            },
            "arguments": {
                "type": "object",
                "description": "Tool call arguments",
            },
            "justification": {
                "type": "string",
                "description": "Why this action should execute",
            },
        },
        "required": ["tool", "arguments", "justification"],
    },
}


class NewAnswerToolkit(BaseToolkit):
    """New Answer toolkit for agent coordination workflows."""

    def __init__(self, template_overrides: dict[str, Any] | None = None):
        """
        Initialize the New Answer toolkit.

        Args:
            template_overrides: Optional template overrides for customization
        """
        self._template_overrides = template_overrides or {}

    @property
    def toolkit_id(self) -> str:
        """Unique identifier for new answer toolkit."""
        return "new_answer"

    @property
    def toolkit_type(self) -> ToolType:
        """Type of this toolkit."""
        return ToolType.WORKFLOW

    def is_enabled(self, config: dict[str, Any]) -> bool:
        """
        Check if new answer is enabled in configuration.

        Args:
            config: Configuration dictionary.

        Returns:
            True if workflow tools are enabled or not explicitly disabled.
        """
        # Enable by default for workflow, unless explicitly disabled
        return config.get("enable_workflow_tools", True)

    def get_tools(self, config: dict[str, Any]) -> list[dict[str, Any]]:
        """
        Get new answer tool definition based on API format.

        Args:
            config: Configuration including api_format and checkpoint_context.

        Returns:
            List containing the new answer tool definition.
        """
        # Check for template override
        if "new_answer_tool" in self._template_overrides:
            override = self._template_overrides["new_answer_tool"]
            if callable(override):
                return [override()]
            return [override]

        api_format = config.get("api_format", "chat_completions")
        checkpoint_context = config.get("checkpoint_context", False)

        if api_format == "claude":
            return [self._build_claude_format(checkpoint_context)]
        elif api_format == "response":
            return [self._build_response_format(checkpoint_context)]
        else:
            return [self._build_chat_completions_format(checkpoint_context)]

    def _build_claude_format(self, checkpoint_context: bool) -> dict[str, Any]:
        """Build Claude native format tool definition."""
        properties: dict[str, Any] = {
            "content": {
                "type": "string",
                "description": ("Your improved answer. If any builtin tools like " "search or code execution were used, mention how " "they are used here."),
            },
        }
        if checkpoint_context:
            properties["proposed_actions"] = _PROPOSED_ACTIONS_SCHEMA

        return {
            "name": "new_answer",
            "description": "Submit a new and improved answer",
            "input_schema": {
                "type": "object",
                "properties": properties,
                "required": ["content"],
            },
        }

    def _build_response_format(self, checkpoint_context: bool) -> dict[str, Any]:
        """Build Response API format tool definition."""
        properties: dict[str, Any] = {
            "content": {
                "type": "string",
                "description": (
                    "Your improved answer (HIGH-LEVEL summary): what you "
                    "created, where to find it, how to use it, key features. "
                    "Do NOT include full code listings - code belongs in "
                    "workspace files. If any builtin tools like search or "
                    "code execution were used, mention how they are used here."
                ),
            },
        }
        if checkpoint_context:
            properties["proposed_actions"] = _PROPOSED_ACTIONS_SCHEMA

        return {
            "type": "function",
            "function": {
                "name": "new_answer",
                "description": "Submit a new and improved answer",
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": ["content"],
                },
            },
        }

    def _build_chat_completions_format(
        self,
        checkpoint_context: bool,
    ) -> dict[str, Any]:
        """Build Chat Completions format tool definition."""
        properties: dict[str, Any] = {
            "content": {
                "type": "string",
                "description": ("Your improved answer. If any builtin tools like " "search or code execution were used, mention how " "they are used here."),
            },
        }
        if checkpoint_context:
            properties["proposed_actions"] = _PROPOSED_ACTIONS_SCHEMA

        return {
            "type": "function",
            "function": {
                "name": "new_answer",
                "description": "Submit a new and improved answer",
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": ["content"],
                },
            },
        }
