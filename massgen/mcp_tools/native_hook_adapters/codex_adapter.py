"""Codex native hook adapter.

This adapter generates ``.codex/hooks.json`` entries for Codex's native hook
surface. MassGen uses it in a hybrid mode where ``PostToolUse`` provides a
Bash-only bridge into the shared ``hook_post_tool_use.json`` payload file.

MassGen runtime payload ownership stays on the existing shared file / MCP path;
the native adapter only creates Codex hook entries that let Bash consume those
payloads after tool execution.
"""

from __future__ import annotations

import shlex
import sys
from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING, Any

from ...logger_config import logger
from .base import NativeHookAdapter

if TYPE_CHECKING:
    from ..hooks import GeneralHookManager, HookType, PatternHook


_HOOK_SCRIPT_NAME = "codex_hook_script.py"
_HOOK_SCRIPT_PATH = Path(__file__).parent / _HOOK_SCRIPT_NAME


class CodexNativeHookAdapter(NativeHookAdapter):
    """Adapts MassGen hooks to Codex ``hooks.json`` command hooks."""

    def __init__(self, hook_dir: Path | None = None, docker_mode: bool = False):
        self._hook_dir = hook_dir
        self.docker_mode = docker_mode

    @property
    def hook_dir(self) -> Path | None:
        return self._hook_dir

    @hook_dir.setter
    def hook_dir(self, value: Path) -> None:
        self._hook_dir = value

    def supports_hook_type(self, hook_type: HookType) -> bool:
        from ..hooks import HookType as HT

        return hook_type == HT.POST_TOOL_USE

    def convert_hook_to_native(
        self,
        hook: PatternHook,
        hook_type: HookType,
        context_factory: Callable[[], dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        from ..hooks import HookType as HT

        _ = context_factory
        event_name = "PreToolUse" if hook_type == HT.PRE_TOOL_USE else "PostToolUse"
        return {
            "event": event_name,
            "matcher": hook.matcher,
            "hook_name": hook.name,
        }

    def build_native_hooks_config(
        self,
        hook_manager: GeneralHookManager,
        agent_id: str | None = None,
        context_factory: Callable[[], dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        from ..hooks import HookType as HT

        _ = context_factory
        if not self._hook_dir:
            logger.warning("[CodexNativeHookAdapter] No hook_dir set, cannot build hooks config")
            return {}

        hook_entries: dict[str, list[dict[str, Any]]] = {
            "PostToolUse": [],
        }
        event_map = {
            HT.POST_TOOL_USE: "PostToolUse",
        }

        for hook_type, event_name in event_map.items():
            hooks = hook_manager.get_hooks_for_agent(agent_id, hook_type)
            if not hooks:
                continue

            matchers = {hook.matcher or "*" for hook in hooks}
            command = self._build_hook_command(event_name)
            for matcher in matchers:
                hook_entries[event_name].append(
                    {
                        "matcher": matcher,
                        "hooks": [
                            {
                                "type": "command",
                                "command": command,
                                "timeout": 10,
                            },
                        ],
                    },
                )

        hooks_config = {event_name: entries for event_name, entries in hook_entries.items() if entries}
        if not hooks_config:
            return {}
        return {"hooks": hooks_config}

    def merge_native_configs(
        self,
        *configs: dict[str, Any],
    ) -> dict[str, Any]:
        merged_hooks: dict[str, list[dict[str, Any]]] = {
            "SessionStart": [],
            "PreToolUse": [],
            "PostToolUse": [],
            "UserPromptSubmit": [],
            "Stop": [],
        }

        for config in configs:
            if not config:
                continue
            hooks = config.get("hooks", {})
            if not isinstance(hooks, dict):
                continue
            for event_name in merged_hooks:
                entries = hooks.get(event_name, [])
                if isinstance(entries, list):
                    merged_hooks[event_name].extend(entries)

        hooks_config = {event_name: entries for event_name, entries in merged_hooks.items() if entries}
        if not hooks_config:
            return {}
        return {"hooks": hooks_config}

    def _build_hook_command(self, event_name: str) -> str:
        python_exe = "python3" if self.docker_mode else sys.executable
        hook_script_path = (self._hook_dir / _HOOK_SCRIPT_NAME) if self._hook_dir else _HOOK_SCRIPT_PATH
        hook_dir = self._hook_dir or _HOOK_SCRIPT_PATH.parent
        return f"{shlex.quote(python_exe)} {shlex.quote(str(hook_script_path))}" f" --hook-dir {shlex.quote(str(hook_dir))}" f" --event {shlex.quote(event_name)}"
