"""Native hook adapters for backend-specific hook integration.

This module provides adapters for converting MassGen's hook framework
to backend-specific native formats. Backends with native hook support
(like Claude Code SDK, Copilot SDK, Gemini CLI) can use these adapters
to handle hooks natively rather than through MassGen's GeneralHookManager.

Available adapters:
- NativeHookAdapter: Abstract base class for all adapters
- ClaudeCodeNativeHookAdapter: Adapter for Claude Code SDK HookMatcher format
- CopilotNativeHookAdapter: Adapter for Copilot SDK onPreToolUse/onPostToolUse format
- GeminiCLINativeHookAdapter: Adapter for Gemini CLI settings.json hook format
- CodexNativeHookAdapter: Adapter for Codex hooks.json command hooks

Example usage:
    from massgen.mcp_tools.native_hook_adapters import ClaudeCodeNativeHookAdapter

    adapter = ClaudeCodeNativeHookAdapter()
    native_config = adapter.build_native_hooks_config(hook_manager)
"""

from .base import NativeHookAdapter
from .claude_code_adapter import ClaudeCodeNativeHookAdapter, is_claude_sdk_available
from .codex_adapter import CodexNativeHookAdapter
from .copilot_adapter import CopilotNativeHookAdapter, is_copilot_sdk_available
from .gemini_cli_adapter import GeminiCLINativeHookAdapter

__all__ = [
    "ClaudeCodeNativeHookAdapter",
    "CodexNativeHookAdapter",
    "CopilotNativeHookAdapter",
    "GeminiCLINativeHookAdapter",
    "NativeHookAdapter",
    "is_claude_sdk_available",
    "is_copilot_sdk_available",
]
