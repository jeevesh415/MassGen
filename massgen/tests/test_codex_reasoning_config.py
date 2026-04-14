"""Tests for Codex reasoning effort config mapping."""

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

try:
    import tomllib
except ImportError:  # pragma: no cover - Python < 3.11 fallback
    import tomli as tomllib

import massgen.backend.codex as codex_module
from massgen import logger_config
from massgen.agent_config import AgentConfig
from massgen.backend.codex import SUBPROCESS_STREAM_LIMIT, CodexBackend
from massgen.orchestrator import Orchestrator


@pytest.fixture(autouse=True)
def _mock_codex_cli(monkeypatch):
    """Avoid requiring a real Codex CLI install in tests."""
    monkeypatch.setattr(CodexBackend, "_find_codex_cli", lambda self: "/usr/bin/codex")
    monkeypatch.setattr(CodexBackend, "_has_cached_credentials", lambda self: True)


def _read_workspace_codex_config(workspace: Path) -> dict:
    config_path = workspace / ".codex" / "config.toml"
    return tomllib.loads(config_path.read_text(encoding="utf-8"))


def test_codex_accepts_openai_style_reasoning_effort(tmp_path: Path):
    backend = CodexBackend(
        cwd=str(tmp_path),
        reasoning={"effort": "high", "summary": "auto"},
    )
    backend._write_workspace_config()

    config = _read_workspace_codex_config(tmp_path)
    assert config["model_reasoning_effort"] == "high"


def test_codex_model_reasoning_effort_takes_precedence(tmp_path: Path):
    backend = CodexBackend(
        cwd=str(tmp_path),
        model_reasoning_effort="xhigh",
        reasoning={"effort": "low", "summary": "auto"},
    )
    backend._write_workspace_config()

    config = _read_workspace_codex_config(tmp_path)
    assert config["model_reasoning_effort"] == "xhigh"


def test_codex_skips_reasoning_effort_when_not_provided(tmp_path: Path):
    backend = CodexBackend(
        cwd=str(tmp_path),
        model="gpt-5.3-codex",
        reasoning={"summary": "auto"},
    )
    backend._write_workspace_config()

    config = _read_workspace_codex_config(tmp_path)
    assert "model_reasoning_effort" not in config


def test_codex_defaults_gpt54_to_high_when_not_provided(tmp_path: Path):
    backend = CodexBackend(
        cwd=str(tmp_path),
        model="gpt-5.4",
        reasoning={"summary": "auto"},
    )
    backend._write_workspace_config()

    config = _read_workspace_codex_config(tmp_path)
    assert config["model_reasoning_effort"] == "high"


def test_codex_disables_view_image_tool_in_workspace_config(tmp_path: Path):
    backend = CodexBackend(cwd=str(tmp_path))
    backend._write_workspace_config()

    config = _read_workspace_codex_config(tmp_path)
    assert config["tools"]["view_image"] is False


def test_codex_filter_enforcement_tool_calls_defaults_to_all_calls(tmp_path: Path):
    backend = CodexBackend(cwd=str(tmp_path))
    tool_calls = [
        {"id": "call_1", "name": "new_answer", "arguments": {"content": "done"}},
        {"id": "call_2", "name": "$BASH", "arguments": {"command": "ls"}},
    ]

    assert backend.filter_enforcement_tool_calls(tool_calls, [tool_calls[1]]) == tool_calls


def test_codex_writes_instructions_file_under_codex_home(tmp_path: Path):
    backend = CodexBackend(cwd=str(tmp_path))
    backend.system_prompt = "system instructions"
    backend._write_workspace_config()

    config = _read_workspace_codex_config(tmp_path)
    instructions_path = tmp_path / ".codex" / "AGENTS.md"
    assert config["model_instructions_file"] == str(instructions_path)
    content = instructions_path.read_text(encoding="utf-8")
    assert content.startswith("system instructions")
    assert "[Human Input]:" in content
    assert not (tmp_path / "AGENTS.md").exists()


def test_codex_write_workspace_config_uses_utf8_for_unicode_instructions(tmp_path: Path):
    backend = CodexBackend(cwd=str(tmp_path))
    backend.system_prompt = "Workflow"
    backend._pending_workflow_instructions = "Choose best answer → then stop"

    backend._write_workspace_config()

    instructions_path = tmp_path / ".codex" / "AGENTS.md"
    assert instructions_path.exists()
    assert "→" in instructions_path.read_text(encoding="utf-8")


def test_codex_appends_runtime_input_priority_guidance(tmp_path: Path):
    backend = CodexBackend(cwd=str(tmp_path))
    backend.system_prompt = "system instructions"
    backend._write_workspace_config()

    instructions_path = tmp_path / ".codex" / "AGENTS.md"
    content = instructions_path.read_text(encoding="utf-8")
    assert "system instructions" in content
    assert "[Human Input]:" in content
    assert "high-priority runtime instruction" in content


def test_codex_fallback_toml_writer_uses_utf8_for_unicode_values(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    import massgen.backend.codex as codex_module

    monkeypatch.setattr(codex_module, "tomli_w", None)

    backend = CodexBackend(
        cwd=str(tmp_path),
        mcp_servers=[
            {
                "name": "unicode_server",
                "type": "stdio",
                "command": "python",
                "args": ["-c", "print('hello')"],
                "env": {"ARROW_VALUE": "A→B"},
            },
        ],
    )
    backend.system_prompt = "Workflow"
    backend._pending_workflow_instructions = "Choose best answer → then stop"

    backend._write_workspace_config()

    config_text = (tmp_path / ".codex" / "config.toml").read_text(encoding="utf-8")
    config = tomllib.loads(config_text)

    assert "ARROW_VALUE" in config_text
    assert config["mcp_servers"]["unicode_server"]["env"]["ARROW_VALUE"] == "A→B"
    assert "→" in (tmp_path / ".codex" / "AGENTS.md").read_text(encoding="utf-8")


def test_codex_mirrors_local_skills_into_codex_home(tmp_path: Path):
    backend = CodexBackend(cwd=str(tmp_path))

    project_skills = tmp_path / ".agent" / "skills"
    project_skill = project_skills / "demo-skill"
    project_skill.mkdir(parents=True)
    (project_skill / "SKILL.md").write_text("# Demo Skill\n")

    backend.filesystem_manager = SimpleNamespace(
        local_skills_directory=project_skills,
        docker_manager=None,
        get_current_workspace=lambda: tmp_path,
    )
    assert backend._resolve_codex_skills_source() == project_skills
    backend._sync_skills_into_codex_home(tmp_path / ".codex")

    mirrored_skill = tmp_path / ".codex" / "skills" / "demo-skill" / "SKILL.md"
    assert mirrored_skill.exists()
    assert mirrored_skill.read_text() == "# Demo Skill\n"


def test_codex_always_registers_massgen_custom_tools_server(tmp_path: Path):
    """Codex should expose the MassGen custom tools server even without user tools."""
    backend = CodexBackend(cwd=str(tmp_path))
    server_names = [s.get("name") for s in backend.mcp_servers if isinstance(s, dict)]
    assert "massgen_custom_tools" in server_names


def test_codex_writes_background_mcp_targets_into_custom_tool_specs(tmp_path: Path):
    """Specs should include MCP targets that background manager may execute."""
    backend = CodexBackend(
        cwd=str(tmp_path),
        mcp_servers=[
            {
                "name": "command_line",
                "type": "stdio",
                "command": "fastmcp",
                "args": ["run", "massgen/filesystem_manager/_code_execution_server.py:create_server"],
            },
        ],
    )
    backend._write_workspace_config()

    specs_path = tmp_path / ".codex" / "custom_tool_specs.json"
    specs = json.loads(specs_path.read_text())

    background_names = {server["name"] for server in specs.get("background_mcp_servers", []) if isinstance(server, dict) and "name" in server}
    assert "command_line" in background_names
    assert "massgen_custom_tools" not in background_names


def test_codex_passes_backend_context_to_massgen_custom_tools_server(tmp_path: Path):
    """Codex should pass backend identity through the custom-tools server launch args."""
    backend = CodexBackend(
        cwd=str(tmp_path),
        model="gpt-5.4",
    )
    backend._write_workspace_config()

    config = _read_workspace_codex_config(tmp_path)
    server = config["mcp_servers"]["massgen_custom_tools"]
    args = server["args"]

    assert "--backend-type" in args
    assert args[args.index("--backend-type") + 1] == "codex"
    assert "--model" in args
    assert args[args.index("--model") + 1] == "gpt-5.4"


def test_codex_redacts_workspace_config_preview_logs(tmp_path: Path) -> None:
    openai_key = "sk-proj-testsecret1234567890abcdefghijklmnopqrstuvwxyz"
    gemini_key = "AIzaSyTestSecret1234567890abcdefghijklmnop"
    backend = CodexBackend(
        cwd=str(tmp_path),
        mcp_servers=[
            {
                "name": "secret_server",
                "type": "stdio",
                "command": "python",
                "args": ["-m", "secret_server"],
                "env": {
                    "OPENAI_API_KEY": openai_key,
                    "GEMINI_API_KEY": gemini_key,
                },
            },
        ],
    )

    messages: list[str] = []
    sink_id = logger_config.logger.add(
        lambda message: messages.append(str(message)),
        format="{message}",
    )
    try:
        backend._write_workspace_config()
    finally:
        logger_config.logger.remove(sink_id)

    written_logs = "".join(messages)
    config_text = (tmp_path / ".codex" / "config.toml").read_text(encoding="utf-8")

    assert openai_key in config_text
    assert gemini_key in config_text
    assert openai_key not in written_logs
    assert gemini_key not in written_logs
    assert 'OPENAI_API_KEY = "[REDACTED]"' in written_logs
    assert 'GEMINI_API_KEY = "[REDACTED]"' in written_logs


def test_codex_writes_execution_trace_markdown(tmp_path: Path):
    backend = CodexBackend(
        cwd=str(tmp_path),
        agent_id="agent_a",
    )

    backend._clear_streaming_buffer(agent_id="agent_a")

    backend._parse_item(
        "reasoning",
        {
            "id": "reason_1",
            "text": "Need to inspect the workspace first.",
        },
        is_completed=True,
    )
    backend._parse_item(
        "agent_message",
        {
            "id": "msg_1",
            "text": "I found the root cause and prepared a fix.",
        },
        is_completed=True,
    )
    backend._parse_item(
        "mcp_tool_call",
        {
            "id": "tool_1",
            "server": "massgen_custom_tools",
            "tool": "custom_tool__read_media",
            "arguments": {"file_path": "artifact.png"},
        },
        is_completed=False,
    )
    backend._parse_item(
        "mcp_tool_call",
        {
            "id": "tool_1",
            "server": "massgen_custom_tools",
            "tool": "custom_tool__read_media",
            "result": "read ok",
        },
        is_completed=True,
    )

    snapshot_dir = tmp_path / "trace_snapshot"
    trace_path = backend._save_execution_trace(snapshot_dir)

    assert trace_path == snapshot_dir / "execution_trace.md"
    trace_text = trace_path.read_text()
    assert "# Execution Trace: agent_a" in trace_text
    assert "### Reasoning" in trace_text
    assert "Need to inspect the workspace first." in trace_text
    assert "### Content" in trace_text
    assert "I found the root cause and prepared a fix." in trace_text
    assert "### Tool Call: massgen_custom_tools/custom_tool__read_media" in trace_text
    assert "### Tool Result: massgen_custom_tools/custom_tool__read_media" in trace_text


@pytest.mark.asyncio
async def test_codex_stream_local_uses_large_subprocess_limit(tmp_path: Path, monkeypatch):
    backend = CodexBackend(cwd=str(tmp_path))
    backend._build_exec_command = lambda prompt, resume_session=False: ["/usr/bin/codex", "exec"]  # noqa: ARG005

    captured_kwargs: dict[str, object] = {}

    class _EmptyAsyncReader:
        def __aiter__(self):
            return self

        async def __anext__(self):
            raise StopAsyncIteration

    class _FakeStderr:
        async def read(self):
            return b""

    class _FakeProcess:
        def __init__(self) -> None:
            self.stdout = _EmptyAsyncReader()
            self.stderr = _FakeStderr()
            self.returncode = 0

        async def wait(self):
            return 0

    async def _fake_create_subprocess_exec(*args, **kwargs):  # noqa: ANN002, ANN003
        del args
        captured_kwargs.update(kwargs)
        return _FakeProcess()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _fake_create_subprocess_exec)

    chunks = [chunk async for chunk in backend._stream_local("prompt", resume_session=False)]

    assert chunks == []
    assert captured_kwargs["limit"] == SUBPROCESS_STREAM_LIMIT


@pytest.mark.asyncio
async def test_codex_stream_docker_ignores_plain_text_diagnostics(tmp_path: Path, monkeypatch):
    backend = CodexBackend(cwd=str(tmp_path), agent_id="agent_a")
    backend._docker_codex_verified = True
    backend._build_exec_command = lambda prompt, resume_session=False, for_docker=False: ["/usr/bin/codex", "exec"]  # noqa: ARG005
    warning_messages: list[str] = []

    fake_home = tmp_path / "home"
    (fake_home / ".codex").mkdir(parents=True)
    (fake_home / ".codex" / "auth.json").write_text("{}", encoding="utf-8")
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: fake_home))
    monkeypatch.setattr(codex_module.logger, "warning", lambda message: warning_messages.append(message))

    output_lines = [
        "Reading additional input from stdin...\n",
        json.dumps({"type": "thread.started", "thread_id": "thread_123"}) + "\n",
        (
            "2026-04-10T16:46:46.610532Z ERROR codex_core::tools::router: "
            "error=Command blocked by PreToolUse hook: Command substitution "
            "and process substitution are not allowed. Command: mkdir -p "
            "deliverable && cat > deliverable/index.html <<'EOF'\n"
        ),
        "<!DOCTYPE html>\n",
        json.dumps(
            {
                "type": "turn.completed",
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 5,
                    "total_tokens": 15,
                },
            },
        )
        + "\n",
    ]

    class _FakeAPI:
        def exec_create(self, container_id, **kwargs):  # noqa: ANN001, ANN003
            del container_id, kwargs
            return {"Id": "exec_1"}

        def exec_start(self, exec_id, **kwargs):  # noqa: ANN001, ANN003
            del exec_id, kwargs
            for line in output_lines:
                yield line.encode("utf-8")

        def exec_inspect(self, exec_id):  # noqa: ANN001
            del exec_id
            return {"ExitCode": 0}

    class _FakeClient:
        def __init__(self) -> None:
            self.api = _FakeAPI()

    class _FakeContainer:
        def __init__(self) -> None:
            self.id = "container_1"
            self.client = _FakeClient()

        def exec_run(self, cmd):  # noqa: ANN001
            del cmd
            return 0, b"/usr/bin/codex\n"

    monkeypatch.setattr(backend, "_get_docker_container", lambda: _FakeContainer())

    chunks = [chunk async for chunk in backend._stream_docker("prompt", resume_session=False)]

    assert [chunk.type for chunk in chunks] == ["agent_status", "done"]
    assert backend.session_id == "thread_123"
    assert not any("Failed to parse Codex event" in message for message in warning_messages)


@pytest.mark.asyncio
async def test_codex_stream_local_still_warns_on_malformed_json_event_line(tmp_path: Path, monkeypatch):
    backend = CodexBackend(cwd=str(tmp_path))
    backend._build_exec_command = lambda prompt, resume_session=False: ["/usr/bin/codex", "exec"]  # noqa: ARG005
    warning_messages: list[str] = []
    monkeypatch.setattr(codex_module.logger, "warning", lambda message: warning_messages.append(message))

    class _FakeStdout:
        def __init__(self, lines: list[str]) -> None:
            self._lines = [line.encode("utf-8") for line in lines]
            self._index = 0

        def __aiter__(self):
            return self

        async def __anext__(self):
            if self._index >= len(self._lines):
                raise StopAsyncIteration
            line = self._lines[self._index]
            self._index += 1
            return line

    class _FakeStderr:
        async def read(self):
            return b""

    class _FakeProcess:
        def __init__(self) -> None:
            self.stdout = _FakeStdout(['{"type": "thread.started"\n'])
            self.stderr = _FakeStderr()
            self.returncode = 0

        async def wait(self):
            return 0

    async def _fake_create_subprocess_exec(*args, **kwargs):  # noqa: ANN002, ANN003
        del args, kwargs
        return _FakeProcess()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _fake_create_subprocess_exec)

    chunks = [chunk async for chunk in backend._stream_local("prompt", resume_session=False)]

    assert chunks == []
    assert any("Failed to parse Codex event" in message for message in warning_messages)


def test_codex_turn_completed_usage_preserves_cached_input_tokens(tmp_path: Path):
    backend = CodexBackend(cwd=str(tmp_path))

    chunks = backend._parse_codex_event(
        {
            "type": "turn.completed",
            "usage": {
                "input_tokens": 1000,
                "output_tokens": 200,
                "total_tokens": 1200,
                "cached_input_tokens": 800,
            },
        },
    )

    assert len(chunks) == 1
    assert chunks[0].type == "done"
    assert chunks[0].usage == {
        "prompt_tokens": 1000,
        "completion_tokens": 200,
        "total_tokens": 1200,
        "cached_input_tokens": 800,
    }


def test_codex_usage_chain_tracks_cached_input_tokens(tmp_path: Path):
    backend = CodexBackend(cwd=str(tmp_path))

    chunks = backend._parse_codex_event(
        {
            "type": "turn.completed",
            "usage": {
                "input_tokens": 1000,
                "output_tokens": 200,
                "total_tokens": 1200,
                "cached_input_tokens": 800,
            },
        },
    )
    done_chunk = chunks[0]
    backend._update_token_usage_from_api_response(done_chunk.usage, backend.model)

    assert backend.token_usage.input_tokens == 1000
    assert backend.token_usage.output_tokens == 200
    assert backend.token_usage.cached_input_tokens == 800


@pytest.mark.asyncio
async def test_codex_execution_trace_saved_via_orchestrator_snapshot(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(logger_config, "_LOG_BASE_SESSION_DIR", None)
    monkeypatch.setattr(logger_config, "_LOG_SESSION_DIR", None)
    monkeypatch.setattr(logger_config, "_CURRENT_TURN", None)
    monkeypatch.setattr(logger_config, "_CURRENT_ATTEMPT", None)
    logger_config.set_log_base_session_dir_absolute(tmp_path / "logs")

    workspace = tmp_path / "workspace"
    workspace.mkdir()
    temp_parent = tmp_path / "temp_workspaces"
    temp_parent.mkdir()
    snapshot_storage = tmp_path / "snapshots"

    backend = CodexBackend(
        cwd=str(workspace),
        agent_id="agent_a",
        agent_temporary_workspace=str(temp_parent),
    )
    backend._clear_streaming_buffer(agent_id="agent_a")
    backend._parse_item(
        "agent_message",
        {"id": "msg_1", "text": "Snapshot trace content"},
        is_completed=True,
    )

    agent = SimpleNamespace(agent_id="agent_a", backend=backend)
    orchestrator = Orchestrator(
        agents={"agent_a": agent},
        config=AgentConfig(),
        snapshot_storage=str(snapshot_storage),
        agent_temporary_workspace=str(temp_parent),
    )

    await orchestrator._save_agent_snapshot(
        "agent_a",
        answer_content="answer",
        context_data=None,
        is_final=False,
    )

    trace_path = backend.filesystem_manager.snapshot_storage / "execution_trace.md"
    assert trace_path.exists()
    assert "Snapshot trace content" in trace_path.read_text()
