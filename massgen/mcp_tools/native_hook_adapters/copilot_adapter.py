"""Copilot native hook adapter.

This module provides the adapter for converting MassGen's hook framework
to Copilot SDK's SessionHooks format, enabling native hook execution
for both PreToolUse and PostToolUse events.

Copilot SDK hook API (from copilot.types):
- SessionHooks keys: on_pre_tool_use, on_post_tool_use, on_session_start, etc.
- PreToolUseHandler(input_data: PreToolUseHookInput, context: dict) -> PreToolUseHookOutput | None
  - input_data: {"timestamp": int, "cwd": str, "toolName": str, "toolArgs": Any}
  - output: {"permissionDecision": "allow"|"deny"|"ask", "permissionDecisionReason": str,
             "modifiedArgs": Any, "additionalContext": str, "suppressOutput": bool}
- PostToolUseHandler(input_data: PostToolUseHookInput, context: dict) -> PostToolUseHookOutput | None
  - input_data: {"timestamp": int, "cwd": str, "toolName": str, "toolArgs": Any, "toolResult": Any}
  - output: {"modifiedResult": Any, "additionalContext": str, "suppressOutput": bool}
"""

import json
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from ...logger_config import logger
from .base import NativeHookAdapter

if TYPE_CHECKING:
    from ..hooks import GeneralHookManager, HookResult, HookType, PatternHook

# Import Copilot SDK conditionally
try:
    import copilot  # noqa: F401

    COPILOT_SDK_AVAILABLE = True
except ImportError:
    COPILOT_SDK_AVAILABLE = False


class CopilotNativeHookAdapter(NativeHookAdapter):
    """Adapts MassGen hooks to Copilot SDK's SessionHooks format.

    Copilot SDK uses session-level hook callbacks configured via SessionHooks
    TypedDict with snake_case keys (on_pre_tool_use, on_post_tool_use).

    Each handler receives:
    - input_data: A TypedDict with toolName (camelCase), toolArgs, etc.
    - context: A dict with session_id

    Unlike Claude SDK's HookMatcher (which has built-in glob patterns),
    Copilot hooks are registered globally per session. Pattern matching is
    done inside the wrapper function.

    This adapter:
    1. Wraps MassGen PatternHook instances as Copilot-compatible handlers
    2. Converts HookResult to Copilot's PreToolUseHookOutput/PostToolUseHookOutput
    3. Supports both PreToolUse and PostToolUse
    4. Handles PostToolUse injection via additionalContext
    """

    def supports_hook_type(self, hook_type: "HookType") -> bool:
        from ..hooks import HookType as HT

        return hook_type in (HT.PRE_TOOL_USE, HT.POST_TOOL_USE)

    def convert_hook_to_native(
        self,
        hook: "PatternHook",
        hook_type: "HookType",
        context_factory: Callable[[], dict[str, Any]] | None = None,
    ) -> Callable:
        """Convert a MassGen PatternHook to a Copilot-compatible handler.

        Returns an async function matching Copilot SDK's handler signature:
            async def(input_data: TypedDict, context: dict) -> dict | None
        """

        async def hook_wrapper(
            input_data: dict[str, Any],
            sdk_context: dict[str, str],
        ) -> dict[str, Any] | None:
            # Extract tool name from TypedDict (camelCase per SDK)
            tool_name = input_data.get("toolName", "")

            # Pattern matching (Copilot hooks are global, so we filter here)
            if not hook.matches(tool_name):
                return None

            # Build MassGen context from both our factory and SDK context
            ctx = context_factory() if context_factory else {}
            ctx["hook_type"] = hook_type.value
            ctx["session_id"] = sdk_context.get("session_id", "")
            ctx["cwd"] = input_data.get("cwd", "")

            # For PostToolUse, include tool output in context
            tool_result = input_data.get("toolResult")
            if tool_result is not None:
                ctx["tool_output"] = tool_result

            # Normalize tool args for MassGen hook interface.
            # The Copilot CLI sends toolArgs as a JSON *string* (e.g.
            # '{"command":"ls"}'), not a parsed dict.  If it's already a
            # string, pass it through; otherwise serialize it.
            tool_args = input_data.get("toolArgs", {})
            if isinstance(tool_args, str):
                arguments_str = tool_args if tool_args else "{}"
            else:
                arguments_str = json.dumps(tool_args) if tool_args else "{}"

            try:
                result = await hook.execute(tool_name, arguments_str, ctx)
                return self.convert_hook_result_to_native(result, hook_type)
            except Exception as e:
                logger.error(
                    f"[CopilotNativeHookAdapter] Hook {hook.name} failed: {e}",
                    exc_info=True,
                )
                if getattr(hook, "fail_closed", False):
                    return {
                        "permissionDecision": "deny",
                        "permissionDecisionReason": f"Hook error: {e}",
                    }
                return None  # Fail open

        return hook_wrapper

    @staticmethod
    def convert_hook_result_to_native(
        result: "HookResult",
        hook_type: "HookType",
    ) -> dict[str, Any] | None:
        """Convert MassGen HookResult to Copilot SDK response format.

        PreToolUseHookOutput: {permissionDecision, permissionDecisionReason,
                               modifiedArgs, additionalContext, suppressOutput}
        PostToolUseHookOutput: {modifiedResult, additionalContext, suppressOutput}
        """
        from ..hooks import HookType as HT

        # Deny
        if not result.allowed or result.decision == "deny":
            return {
                "permissionDecision": "deny",
                "permissionDecisionReason": result.reason or "Denied by hook",
            }

        # Ask → deny with explanation
        if result.decision == "ask":
            return {
                "permissionDecision": "deny",
                "permissionDecisionReason": f"User confirmation required: {result.reason}",
            }

        # PreToolUse with modified args
        if hook_type == HT.PRE_TOOL_USE and (result.updated_input or result.modified_args):
            updated = result.updated_input
            if updated is None and result.modified_args:
                try:
                    updated = json.loads(result.modified_args)
                except (json.JSONDecodeError, TypeError):
                    updated = None
            if isinstance(updated, dict) and updated:
                return {"modifiedArgs": updated}

        # PostToolUse with injection
        if hook_type == HT.POST_TOOL_USE and result.inject:
            inject_content = result.inject.get("content", "")
            if inject_content:
                return {"additionalContext": inject_content}

        # Allow (no modifications)
        return None

    def build_native_hooks_config(
        self,
        hook_manager: "GeneralHookManager",
        agent_id: str | None = None,
        context_factory: Callable[[], dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Build Copilot SessionHooks config from GeneralHookManager.

        Returns a dict matching Copilot SDK's SessionHooks TypedDict:
        {"on_pre_tool_use": handler, "on_post_tool_use": handler}

        Since Copilot SDK expects a single handler per hook type (not a list),
        we create a composite handler that runs all registered hooks in sequence.
        """
        from ..hooks import HookType as HT

        config: dict[str, Any] = {}

        key_map = {
            HT.PRE_TOOL_USE: "on_pre_tool_use",
            HT.POST_TOOL_USE: "on_post_tool_use",
        }

        for hook_type, config_key in key_map.items():
            hooks = hook_manager.get_hooks_for_agent(agent_id, hook_type)
            if not hooks:
                continue

            wrappers = [self.convert_hook_to_native(hook, hook_type, context_factory) for hook in hooks]

            # Create composite handler that runs all hooks in sequence
            config[config_key] = self._create_composite_handler(wrappers, hook_type)

        return config

    @staticmethod
    def _create_composite_handler(
        wrappers: list[Callable],
        hook_type: "HookType",
    ) -> Callable:
        """Create a single handler that runs multiple hooks in sequence.

        For PreToolUse: first deny wins; args modifications accumulate.
        For PostToolUse: additionalContext values are concatenated.
        """

        async def composite_handler(
            input_data: dict[str, Any],
            sdk_context: dict[str, str],
        ) -> dict[str, Any] | None:
            merged_result: dict[str, Any] = {}

            for wrapper in wrappers:
                result = await wrapper(input_data, sdk_context)
                if result is None:
                    continue

                # Deny takes immediate precedence
                if result.get("permissionDecision") == "deny":
                    return result

                # Accumulate modifications
                if "modifiedArgs" in result:
                    merged_result["modifiedArgs"] = result["modifiedArgs"]
                if "additionalContext" in result:
                    existing = merged_result.get("additionalContext", "")
                    new_ctx = result["additionalContext"]
                    merged_result["additionalContext"] = f"{existing}\n{new_ctx}" if existing else new_ctx
                if "modifiedResult" in result:
                    merged_result["modifiedResult"] = result["modifiedResult"]

            return merged_result or None

        return composite_handler

    def merge_native_configs(
        self,
        *configs: dict[str, Any],
    ) -> dict[str, Any]:
        """Merge multiple Copilot hook configs.

        Since Copilot SDK uses single handlers (not lists), merging creates
        new composite handlers that chain the handlers from each config.
        """
        merged_wrappers: dict[str, list[Callable]] = {
            "on_pre_tool_use": [],
            "on_post_tool_use": [],
        }

        for config in configs:
            if not config:
                continue
            for key in ("on_pre_tool_use", "on_post_tool_use"):
                if key in config and callable(config[key]):
                    merged_wrappers[key].append(config[key])

        from ..hooks import HookType as HT

        type_map = {
            "on_pre_tool_use": HT.PRE_TOOL_USE,
            "on_post_tool_use": HT.POST_TOOL_USE,
        }

        result: dict[str, Any] = {}
        for key, wrappers in merged_wrappers.items():
            if not wrappers:
                continue
            if len(wrappers) == 1:
                result[key] = wrappers[0]
            else:
                result[key] = self._create_composite_handler(wrappers, type_map[key])

        return result


def is_copilot_sdk_available() -> bool:
    """Check if Copilot SDK is available."""
    return COPILOT_SDK_AVAILABLE
