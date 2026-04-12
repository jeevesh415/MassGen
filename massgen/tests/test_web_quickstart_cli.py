"""Tests for dedicated web quickstart CLI and temporary session API."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from massgen.backend.capabilities import get_all_backend_types
from massgen.frontend.displays.web_display import WebDisplay
from massgen.frontend.web.server import create_app


def test_main_parser_accepts_web_quickstart_flag():
    """Dedicated browser quickstart should be a first-class CLI flag."""
    from massgen.cli import main_parser

    args = main_parser().parse_args(["--web-quickstart"])

    assert args.web_quickstart is True


def test_main_parser_collects_explicit_quickstart_agents():
    """Repeated quickstart agent flags should be preserved in order."""
    from massgen.cli import main_parser

    args = main_parser().parse_args(
        [
            "--quickstart",
            "--headless",
            "--quickstart-agent",
            "backend=claude,model=claude-opus-4-6",
            "--quickstart-agent",
            "backend=openai,model=gpt-5.4",
        ],
    )

    assert args.quickstart_agents == [
        "backend=claude,model=claude-opus-4-6",
        "backend=openai,model=gpt-5.4",
    ]


def test_main_parser_stores_config_agent_id():
    """Single-backend headless config generation should accept an explicit agent id."""
    from massgen.cli import main_parser

    args = main_parser().parse_args(
        [
            "--quickstart",
            "--headless",
            "--config-backend",
            "openai",
            "--config-model",
            "gpt-5.4",
            "--config-agent-id",
            "agent_a",
        ],
    )

    assert args.config_agent_id == "agent_a"


def test_main_parser_accepts_codex_backend_choice():
    """`--backend codex` should parse like any other registered backend."""
    from massgen.cli import main_parser

    args = main_parser().parse_args(["--backend", "codex", "--model", "gpt-5.4", "test"])

    assert args.backend == "codex"


def test_main_parser_backend_choices_match_registry():
    """`--backend` argparse choices should stay in sync with the backend registry."""
    from massgen.cli import main_parser

    parser = main_parser()
    backend_action = next(action for action in parser._actions if action.dest == "backend")

    assert set(backend_action.choices) == set(get_all_backend_types())


def test_validate_mode_flag_combinations_rejects_web_quickstart_with_web():
    """Dedicated temporary quickstart should not be mixed with the persistent Web UI mode."""
    from massgen.cli import main_parser, validate_mode_flag_combinations

    args = main_parser().parse_args(["--web-quickstart", "--web"])

    errors = validate_mode_flag_combinations(args)

    assert any("--web-quickstart already launches" in error for error in errors)


def test_validate_mode_flag_combinations_rejects_quickstart_agents_with_single_backend_flags():
    """Explicit agent specs should replace, not mix with, single-backend quickstart overrides."""
    from massgen.cli import main_parser, validate_mode_flag_combinations

    args = main_parser().parse_args(
        [
            "--quickstart",
            "--headless",
            "--quickstart-agent",
            "backend=claude,model=claude-opus-4-6",
            "--config-backend",
            "openai",
        ],
    )

    errors = validate_mode_flag_combinations(args)

    assert any("--quickstart-agent cannot be combined" in error for error in errors)


def test_validate_mode_flag_combinations_rejects_quickstart_agents_with_config_agent_id():
    """Explicit per-agent specs should own IDs too; the global override should not mix in."""
    from massgen.cli import main_parser, validate_mode_flag_combinations

    args = main_parser().parse_args(
        [
            "--quickstart",
            "--headless",
            "--quickstart-agent",
            "id=agent_a,backend=claude,model=claude-opus-4-6",
            "--config-agent-id",
            "agent_b",
        ],
    )

    errors = validate_mode_flag_combinations(args)

    assert any("--quickstart-agent cannot be combined" in error for error in errors)


def test_quickstart_complete_endpoint_stops_temporary_server():
    """Temporary completion should capture the saved config path and exit."""
    temporary_session = {
        "mode": "temporary",
        "server": SimpleNamespace(should_exit=False),
        "status": "running",
        "config_path": None,
    }
    app = create_app(temporary_quickstart_session=temporary_session)
    client = TestClient(app)

    response = client.post(
        "/api/quickstart/complete",
        json={"config_path": "/tmp/project/.massgen/config.yaml"},
    )

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert temporary_session["status"] == "completed"
    assert temporary_session["config_path"] == "/tmp/project/.massgen/config.yaml"
    assert temporary_session["server"].should_exit is True


def test_quickstart_cancel_endpoint_stops_temporary_server():
    """Temporary cancel should stop the server without a config path."""
    temporary_session = {
        "mode": "temporary",
        "server": SimpleNamespace(should_exit=False),
        "status": "running",
        "config_path": None,
    }
    app = create_app(temporary_quickstart_session=temporary_session)
    client = TestClient(app)

    response = client.post("/api/quickstart/cancel")

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert temporary_session["status"] == "cancelled"
    assert temporary_session["config_path"] is None
    assert temporary_session["server"].should_exit is True


@pytest.mark.asyncio
async def test_web_display_notify_phase_emits_structured_phase_change_event():
    """Web clients should receive phase changes even without relying on the shared event emitter."""
    display = WebDisplay(agent_ids=["agent_a"], session_id="session-1")

    display.notify_phase("coordinating")

    event = await display._event_queue.get()

    assert event["type"] == "structured_event"
    assert event["event_type"] == "phase_change"
    assert event["data"] == {"phase": "coordinating"}


def test_web_display_state_snapshot_includes_current_phase():
    """Late-joining WebUI clients should recover the current mode bar phase."""
    display = WebDisplay(agent_ids=["agent_a"], session_id="session-1")

    display.notify_phase("coordinating")

    snapshot = display.get_state_snapshot()

    assert snapshot["current_phase"] == "coordinating"
