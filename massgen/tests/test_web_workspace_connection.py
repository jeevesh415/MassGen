from pathlib import Path

import pytest

from massgen.frontend.web.server import (
    WorkspaceConnectionManager,
    _resolve_watch_session_workspaces,
    _scan_workspace_files,
)


class _DisconnectingWorkspaceWebSocket:
    def __init__(self) -> None:
        self.accepted = False
        self.sent_payloads: list[dict] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, payload: dict) -> None:
        self.sent_payloads.append(payload)
        raise RuntimeError("client disconnected")


@pytest.mark.asyncio
async def test_workspace_connect_reports_failed_initial_send_when_client_disconnects() -> None:
    manager = WorkspaceConnectionManager()
    websocket = _DisconnectingWorkspaceWebSocket()

    connected = await manager.connect(websocket, "session-late-attach", [])

    assert websocket.accepted is True
    assert connected is False


def test_resolve_watch_session_workspaces_keeps_live_workspace_even_when_it_has_no_visible_files(
    tmp_path: Path,
) -> None:
    current_workspace = tmp_path / "workspace_live"
    (current_workspace / ".codex").mkdir(parents=True)
    (current_workspace / ".codex" / "config.toml").write_text("model = 'gpt-5.4'\n", encoding="utf-8")

    log_dir = tmp_path / "turn_1" / "attempt_1"
    final_workspace = log_dir / "final" / "agent_a" / "workspace"
    (final_workspace / "deliverables").mkdir(parents=True)
    (final_workspace / "deliverables" / "love_poem.md").write_text(
        "# Love\n\nA visible file.\n",
        encoding="utf-8",
    )

    status_data = {
        "agents": {
            "agent_a": {
                "workspace_paths": {
                    "workspace": str(current_workspace),
                },
            },
        },
    }

    resolved = _resolve_watch_session_workspaces(status_data, log_dir)

    assert resolved == [
        (
            "agent_a",
            str(current_workspace.resolve()),
            [],
        ),
    ]


def test_resolve_watch_session_workspaces_uses_logged_snapshot_when_no_live_workspace_exists(
    tmp_path: Path,
) -> None:
    log_dir = tmp_path / "turn_1" / "attempt_1"
    final_workspace = log_dir / "final" / "agent_a" / "workspace"
    (final_workspace / "deliverables").mkdir(parents=True)
    (final_workspace / "deliverables" / "love_poem.md").write_text(
        "# Love\n\nA visible file.\n",
        encoding="utf-8",
    )

    status_data = {
        "agents": {
            "agent_a": {
                "workspace_paths": {},
            },
        },
    }

    resolved = _resolve_watch_session_workspaces(status_data, log_dir)

    assert resolved == [
        (
            "agent_a",
            str(final_workspace.resolve()),
            [
                {
                    "path": "deliverables/love_poem.md",
                    "size": 24,
                    "modified": resolved[0][2][0]["modified"],
                },
            ],
        ),
    ]


def test_resolve_watch_session_workspaces_keeps_current_workspace_when_it_has_visible_files(
    tmp_path: Path,
) -> None:
    current_workspace = tmp_path / "workspace_live"
    (current_workspace / "deliverables").mkdir(parents=True)
    (current_workspace / "deliverables" / "draft.md").write_text(
        "visible now\n",
        encoding="utf-8",
    )

    log_dir = tmp_path / "turn_1" / "attempt_1"
    final_workspace = log_dir / "final" / "agent_a" / "workspace"
    (final_workspace / "deliverables").mkdir(parents=True)
    (final_workspace / "deliverables" / "final.md").write_text(
        "should not replace current\n",
        encoding="utf-8",
    )

    status_data = {
        "agents": {
            "agent_a": {
                "workspace_paths": {
                    "workspace": str(current_workspace),
                },
            },
        },
    }

    resolved = _resolve_watch_session_workspaces(status_data, log_dir)

    assert resolved == [
        (
            "agent_a",
            str(current_workspace.resolve()),
            [
                {
                    "path": "deliverables/draft.md",
                    "size": 12,
                    "modified": resolved[0][2][0]["modified"],
                },
            ],
        ),
    ]


def test_resolve_watch_session_workspaces_keeps_last_known_live_workspace_when_status_is_unreadable(
    tmp_path: Path,
) -> None:
    current_workspace = tmp_path / "workspace_live_674c6c33"
    (current_workspace / "deliverables").mkdir(parents=True)
    (current_workspace / "deliverables" / "draft.md").write_text(
        "still live\n",
        encoding="utf-8",
    )

    log_dir = tmp_path / "turn_1" / "attempt_1"
    historical_workspace = log_dir / "agent_a" / "20260327_004711_702591" / "workspace"
    (historical_workspace / "deliverables").mkdir(parents=True)
    (historical_workspace / "deliverables" / "snapshot.md").write_text(
        "stale snapshot\n",
        encoding="utf-8",
    )

    resolved = _resolve_watch_session_workspaces(
        None,
        log_dir,
        fallback_live_workspaces_by_agent={
            "agent_a": str(current_workspace),
        },
    )

    assert resolved == [
        (
            "agent_a",
            str(current_workspace.resolve()),
            [
                {
                    "path": "deliverables/draft.md",
                    "size": 11,
                    "modified": resolved[0][2][0]["modified"],
                },
            ],
        ),
    ]


def test_scan_workspace_files_includes_massgen_scratch_contents(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    (workspace / ".massgen_scratch" / "verification").mkdir(parents=True)
    (workspace / ".massgen_scratch" / "verification" / "render.png").write_text(
        "png bytes",
        encoding="utf-8",
    )
    (workspace / ".vscode").mkdir(parents=True)
    (workspace / ".vscode" / "settings.json").write_text(
        "{}",
        encoding="utf-8",
    )

    files = _scan_workspace_files(workspace)
    paths = {file_info["path"] for file_info in files}

    assert ".massgen_scratch/verification/render.png" in paths
    assert ".vscode/settings.json" not in paths
