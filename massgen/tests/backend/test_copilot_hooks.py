"""Tests for CopilotNativeHookAdapter.

Verifies that MassGen's hook framework is correctly adapted to the
Copilot SDK's SessionHooks format (on_pre_tool_use/on_post_tool_use).

Copilot SDK handler signature:
    async def handler(input_data: TypedDict, context: dict[str, str]) -> dict | None
Where input_data has camelCase keys: toolName, toolArgs, toolResult, cwd, timestamp.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from massgen.mcp_tools.hooks import (
    GeneralHookManager,
    HookResult,
    HookType,
    PatternHook,
)


# ---------------------------------------------------------------------------
# Stub PatternHook for testing
# ---------------------------------------------------------------------------
class StubHook(PatternHook):
    """A simple hook that returns a configurable result."""

    def __init__(self, name="stub", matcher="*", result=None):
        super().__init__(name=name, matcher=matcher)
        self._result = result or HookResult()

    async def execute(self, function_name, arguments, context=None, **kwargs):
        return self._result


# ---------------------------------------------------------------------------
# Helper: build SDK-shaped input_data dicts
# ---------------------------------------------------------------------------
def _pre_tool_input(tool_name: str, tool_args: dict | str | None = None) -> dict:
    return {
        "timestamp": 1234567890,
        "cwd": "/workspace",
        "toolName": tool_name,
        "toolArgs": tool_args if tool_args is not None else {},
    }


def _post_tool_input(
    tool_name: str,
    tool_args: dict | None = None,
    tool_result: str = "ok",
) -> dict:
    return {
        "timestamp": 1234567890,
        "cwd": "/workspace",
        "toolName": tool_name,
        "toolArgs": tool_args or {},
        "toolResult": tool_result,
    }


SDK_CONTEXT = {"session_id": "sess_123"}


# ---------------------------------------------------------------------------
# Fixture: adapter instance (mocks copilot SDK import)
# ---------------------------------------------------------------------------
@pytest.fixture
def adapter():
    """Create a CopilotNativeHookAdapter with mocked SDK."""
    with patch.dict("sys.modules", {"copilot": MagicMock()}):
        from massgen.mcp_tools.native_hook_adapters.copilot_adapter import (
            CopilotNativeHookAdapter,
        )

        return CopilotNativeHookAdapter()


# ---------------------------------------------------------------------------
# supports_hook_type
# ---------------------------------------------------------------------------
class TestSupportsHookType:
    def test_pre_tool_use(self, adapter):
        assert adapter.supports_hook_type(HookType.PRE_TOOL_USE) is True

    def test_post_tool_use(self, adapter):
        assert adapter.supports_hook_type(HookType.POST_TOOL_USE) is True

    def test_legacy_types_unsupported(self, adapter):
        assert adapter.supports_hook_type(HookType.PRE_CALL) is False
        assert adapter.supports_hook_type(HookType.POST_CALL) is False


# ---------------------------------------------------------------------------
# convert_hook_result_to_native
# ---------------------------------------------------------------------------
class TestConvertHookResultToNative:
    def test_allow_returns_none(self, adapter):
        result = HookResult(allowed=True, decision="allow")
        native = adapter.convert_hook_result_to_native(result, HookType.PRE_TOOL_USE)
        assert native is None

    def test_deny_returns_permission_deny(self, adapter):
        result = HookResult(allowed=False, decision="deny", reason="Blocked by policy")
        native = adapter.convert_hook_result_to_native(result, HookType.PRE_TOOL_USE)
        assert native["permissionDecision"] == "deny"
        assert "Blocked by policy" in native["permissionDecisionReason"]

    def test_ask_maps_to_deny(self, adapter):
        result = HookResult(decision="ask", reason="Need confirmation")
        native = adapter.convert_hook_result_to_native(result, HookType.PRE_TOOL_USE)
        assert native["permissionDecision"] == "deny"
        assert "Need confirmation" in native["permissionDecisionReason"]

    def test_pre_tool_modified_args(self, adapter):
        result = HookResult(
            decision="allow",
            updated_input={"path": "/safe/path"},
        )
        native = adapter.convert_hook_result_to_native(result, HookType.PRE_TOOL_USE)
        assert native["modifiedArgs"] == {"path": "/safe/path"}

    def test_pre_tool_modified_args_from_json_string(self, adapter):
        result = HookResult(
            decision="allow",
            modified_args=json.dumps({"path": "/safe/path"}),
        )
        native = adapter.convert_hook_result_to_native(result, HookType.PRE_TOOL_USE)
        assert native["modifiedArgs"] == {"path": "/safe/path"}

    def test_post_tool_injection(self, adapter):
        result = HookResult(
            decision="allow",
            inject={"content": "Remember to vote after this round."},
        )
        native = adapter.convert_hook_result_to_native(result, HookType.POST_TOOL_USE)
        assert native["additionalContext"] == "Remember to vote after this round."

    def test_post_tool_empty_injection_returns_none(self, adapter):
        result = HookResult(decision="allow", inject={"content": ""})
        native = adapter.convert_hook_result_to_native(result, HookType.POST_TOOL_USE)
        assert native is None


# ---------------------------------------------------------------------------
# convert_hook_to_native (wrapper function with SDK-shaped input)
# ---------------------------------------------------------------------------
class TestConvertHookToNative:
    @pytest.mark.asyncio
    async def test_wrapper_calls_hook_on_match(self, adapter):
        hook = StubHook(
            name="test_hook",
            matcher="*",
            result=HookResult(allowed=False, reason="denied"),
        )
        wrapper = adapter.convert_hook_to_native(hook, HookType.PRE_TOOL_USE)
        assert callable(wrapper)

        native_result = await wrapper(
            _pre_tool_input("some_tool", {"arg": "val"}),
            SDK_CONTEXT,
        )
        assert native_result["permissionDecision"] == "deny"

    @pytest.mark.asyncio
    async def test_wrapper_skips_non_matching_tool(self, adapter):
        hook = StubHook(
            name="write_only",
            matcher="Write|Edit",
            result=HookResult(allowed=False, reason="denied"),
        )
        wrapper = adapter.convert_hook_to_native(hook, HookType.PRE_TOOL_USE)

        native_result = await wrapper(
            _pre_tool_input("Read", {"path": "/foo"}),
            SDK_CONTEXT,
        )
        assert native_result is None

    @pytest.mark.asyncio
    async def test_wrapper_matches_glob_pattern(self, adapter):
        hook = StubHook(
            name="mcp_only",
            matcher="mcp__*",
            result=HookResult(allowed=False, reason="blocked"),
        )
        wrapper = adapter.convert_hook_to_native(hook, HookType.PRE_TOOL_USE)

        native_result = await wrapper(
            _pre_tool_input("mcp__filesystem__write", {"path": "/x"}),
            SDK_CONTEXT,
        )
        assert native_result["permissionDecision"] == "deny"

    @pytest.mark.asyncio
    async def test_wrapper_passes_context(self, adapter):
        captured = {}

        class CapturingHook(PatternHook):
            def __init__(self):
                super().__init__(name="capture", matcher="*")

            async def execute(self, function_name, arguments, context=None, **kwargs):
                captured.update(context or {})
                return HookResult()

        hook = CapturingHook()

        def ctx_factory():
            return {"agent_id": "agent_a", "orchestrator_id": "orch_1"}

        wrapper = adapter.convert_hook_to_native(
            hook,
            HookType.PRE_TOOL_USE,
            context_factory=ctx_factory,
        )
        await wrapper(_pre_tool_input("some_tool"), SDK_CONTEXT)
        assert captured["agent_id"] == "agent_a"
        assert captured["session_id"] == "sess_123"
        assert captured["cwd"] == "/workspace"

    @pytest.mark.asyncio
    async def test_wrapper_passes_tool_result_for_post_hook(self, adapter):
        captured = {}

        class CapturingHook(PatternHook):
            def __init__(self):
                super().__init__(name="capture", matcher="*")

            async def execute(self, function_name, arguments, context=None, **kwargs):
                captured.update(context or {})
                return HookResult()

        hook = CapturingHook()
        wrapper = adapter.convert_hook_to_native(hook, HookType.POST_TOOL_USE)
        await wrapper(
            _post_tool_input("some_tool", tool_result="file written"),
            SDK_CONTEXT,
        )
        assert captured["tool_output"] == "file written"

    @pytest.mark.asyncio
    async def test_wrapper_extracts_tool_name_from_camel_case(self, adapter):
        """Verify toolName (camelCase) is correctly extracted from input_data."""
        captured_name = []

        class NameCapture(PatternHook):
            def __init__(self):
                super().__init__(name="capture", matcher="*")

            async def execute(self, function_name, arguments, context=None, **kwargs):
                captured_name.append(function_name)
                return HookResult()

        wrapper = adapter.convert_hook_to_native(NameCapture(), HookType.PRE_TOOL_USE)
        await wrapper(_pre_tool_input("mcp__fs__write"), SDK_CONTEXT)
        assert captured_name[0] == "mcp__fs__write"

    @pytest.mark.asyncio
    async def test_wrapper_fail_open_on_error(self, adapter):
        class FailingHook(PatternHook):
            def __init__(self):
                super().__init__(name="failing", matcher="*")

            async def execute(self, function_name, arguments, context=None, **kwargs):
                raise RuntimeError("hook crashed")

        wrapper = adapter.convert_hook_to_native(
            FailingHook(),
            HookType.PRE_TOOL_USE,
        )
        native_result = await wrapper(_pre_tool_input("some_tool"), SDK_CONTEXT)
        assert native_result is None


# ---------------------------------------------------------------------------
# build_native_hooks_config
# ---------------------------------------------------------------------------
class TestBuildNativeHooksConfig:
    def test_builds_from_manager_with_snake_case_keys(self, adapter):
        manager = GeneralHookManager()
        manager.register_global_hook(
            HookType.PRE_TOOL_USE,
            StubHook(name="pre_hook", result=HookResult(allowed=False)),
        )
        manager.register_global_hook(
            HookType.POST_TOOL_USE,
            StubHook(name="post_hook", result=HookResult(inject={"content": "hi"})),
        )

        config = adapter.build_native_hooks_config(manager)
        # SDK expects snake_case keys
        assert "on_pre_tool_use" in config
        assert "on_post_tool_use" in config
        # Each should be a single callable (composite handler)
        assert callable(config["on_pre_tool_use"])
        assert callable(config["on_post_tool_use"])

    def test_empty_manager_returns_empty(self, adapter):
        manager = GeneralHookManager()
        config = adapter.build_native_hooks_config(manager)
        assert config == {}

    def test_agent_specific_hooks(self, adapter):
        manager = GeneralHookManager()
        manager.register_agent_hook(
            "agent_a",
            HookType.PRE_TOOL_USE,
            StubHook(name="agent_a_hook"),
        )

        config = adapter.build_native_hooks_config(manager, agent_id="agent_a")
        assert "on_pre_tool_use" in config
        assert callable(config["on_pre_tool_use"])

    @pytest.mark.asyncio
    async def test_composite_handler_runs_all_hooks(self, adapter):
        """Multiple hooks for same type should all execute via composite handler."""
        call_order = []

        class OrderHook(PatternHook):
            def __init__(self, name, order):
                super().__init__(name=name, matcher="*")
                self._order = order

            async def execute(self, function_name, arguments, context=None, **kwargs):
                call_order.append(self._order)
                return HookResult()

        manager = GeneralHookManager()
        manager.register_global_hook(HookType.PRE_TOOL_USE, OrderHook("first", 1))
        manager.register_global_hook(HookType.PRE_TOOL_USE, OrderHook("second", 2))

        config = adapter.build_native_hooks_config(manager)
        handler = config["on_pre_tool_use"]
        await handler(_pre_tool_input("tool"), SDK_CONTEXT)
        assert call_order == [1, 2]

    @pytest.mark.asyncio
    async def test_composite_handler_deny_short_circuits(self, adapter):
        """First deny should stop further hook execution."""
        manager = GeneralHookManager()
        manager.register_global_hook(
            HookType.PRE_TOOL_USE,
            StubHook(name="deny", result=HookResult(allowed=False, reason="nope")),
        )
        manager.register_global_hook(
            HookType.PRE_TOOL_USE,
            StubHook(name="allow", result=HookResult()),
        )

        config = adapter.build_native_hooks_config(manager)
        result = await config["on_pre_tool_use"](
            _pre_tool_input("tool"),
            SDK_CONTEXT,
        )
        assert result["permissionDecision"] == "deny"


# ---------------------------------------------------------------------------
# merge_native_configs
# ---------------------------------------------------------------------------
class TestMergeConfigs:
    def test_merges_handlers(self, adapter):
        config_a = {"on_pre_tool_use": lambda *a: None}
        config_b = {"on_pre_tool_use": lambda *a: None, "on_post_tool_use": lambda *a: None}

        merged = adapter.merge_native_configs(config_a, config_b)
        assert "on_pre_tool_use" in merged
        assert "on_post_tool_use" in merged
        assert callable(merged["on_pre_tool_use"])
        assert callable(merged["on_post_tool_use"])

    def test_empty_configs(self, adapter):
        merged = adapter.merge_native_configs({}, None, {})
        assert merged == {}

    def test_single_config_passthrough(self, adapter):
        handler = lambda *a: None  # noqa: E731
        config = {"on_pre_tool_use": handler}
        merged = adapter.merge_native_configs(config)
        # Single handler should be passed through directly
        assert merged["on_pre_tool_use"] is handler


# ---------------------------------------------------------------------------
# toolArgs as JSON string (Copilot CLI sends stringified JSON)
# ---------------------------------------------------------------------------
class TestToolArgsStringHandling:
    """Copilot CLI sends toolArgs as a JSON string, not a parsed dict.

    The adapter must pass strings through as-is rather than double-encoding
    them with json.dumps().  Previously, double-encoding caused the
    downstream hook to json.loads() back to a Python string instead of a
    dict, crashing PathPermissionManager with 'string indices must be
    integers'.
    """

    @pytest.mark.asyncio
    async def test_string_tool_args_passed_through(self, adapter):
        """When toolArgs is already a JSON string, adapter should not re-encode."""
        call_log = []

        class SpyHook(PatternHook):
            async def execute(self, fn_name, arguments_str, context=None, **kw):
                call_log.append({"fn": fn_name, "args": arguments_str})
                return HookResult(allowed=True)

        wrapper = adapter.convert_hook_to_native(SpyHook(name="spy", matcher="*"), HookType.PRE_TOOL_USE)

        # Simulate Copilot CLI format: toolArgs is already a JSON string
        await wrapper(
            _pre_tool_input("bash", '{"command":"ls -la"}'),
            SDK_CONTEXT,
        )

        assert len(call_log) == 1
        # The hook should receive the JSON string directly — json.loads
        # should produce a dict, not a string
        import json

        parsed = json.loads(call_log[0]["args"])
        assert isinstance(parsed, dict)
        assert parsed["command"] == "ls -la"

    @pytest.mark.asyncio
    async def test_dict_tool_args_still_serialized(self, adapter):
        """When toolArgs is a dict (custom tools), adapter should json.dumps it."""
        call_log = []

        class SpyHook(PatternHook):
            async def execute(self, fn_name, arguments_str, context=None, **kw):
                call_log.append({"fn": fn_name, "args": arguments_str})
                return HookResult(allowed=True)

        wrapper = adapter.convert_hook_to_native(SpyHook(name="spy", matcher="*"), HookType.PRE_TOOL_USE)

        await wrapper(
            _pre_tool_input("custom_tool", {"key": "value"}),
            SDK_CONTEXT,
        )

        assert len(call_log) == 1
        import json

        parsed = json.loads(call_log[0]["args"])
        assert isinstance(parsed, dict)
        assert parsed["key"] == "value"
