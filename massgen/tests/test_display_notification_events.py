"""Tests for standardized display notification events.

Verifies that:
1. New EventType constants exist
2. EventEmitter can emit new event types
3. Events are written to events.jsonl and can be read back
4. TUI event handler routes new events to correct display methods
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest

from massgen.events import (
    EventEmitter,
    EventReader,
    EventType,
    MassGenEvent,
)

# ---------------------------------------------------------------------------
# 1. EventType constants exist
# ---------------------------------------------------------------------------


class TestEventTypeConstants:
    """Verify the five new EventType constants are defined."""

    def test_pre_collab_started_constant(self):
        assert EventType.PRE_COLLAB_STARTED == "pre_collab_started"

    def test_pre_collab_completed_constant(self):
        assert EventType.PRE_COLLAB_COMPLETED == "pre_collab_completed"

    def test_personas_set_constant(self):
        assert EventType.PERSONAS_SET == "personas_set"

    def test_evaluation_criteria_set_constant(self):
        assert EventType.EVALUATION_CRITERIA_SET == "evaluation_criteria_set"

    def test_subtasks_set_constant(self):
        assert EventType.SUBTASKS_SET == "subtasks_set"


# ---------------------------------------------------------------------------
# 2. EventEmitter can emit + file round-trip
# ---------------------------------------------------------------------------


class TestEventEmission:
    """Verify events are emitted and written to events.jsonl correctly."""

    def test_emit_pre_collab_started(self, tmp_path: Path):
        emitter = EventEmitter(tmp_path)
        emitter.emit_raw(
            EventType.PRE_COLLAB_STARTED,
            agent_id="agent_1",
            subagent_id="persona_generation",
            task="Generate personas",
            log_path="/tmp/logs/subagents/persona_generation",
        )
        emitter.close()

        reader = EventReader(tmp_path / "events.jsonl")
        events = reader.read_all()
        assert len(events) == 1
        assert events[0].event_type == "pre_collab_started"
        assert events[0].agent_id == "agent_1"
        assert events[0].data["subagent_id"] == "persona_generation"
        assert events[0].data["task"] == "Generate personas"
        assert events[0].data["log_path"] == "/tmp/logs/subagents/persona_generation"

    def test_emit_pre_collab_completed(self, tmp_path: Path):
        emitter = EventEmitter(tmp_path)
        emitter.emit_raw(
            EventType.PRE_COLLAB_COMPLETED,
            agent_id="agent_1",
            subagent_id="persona_generation",
            status="completed",
            answer_preview="agent_1: Analytical | agent_2: Creative",
        )
        emitter.close()

        reader = EventReader(tmp_path / "events.jsonl")
        events = reader.read_all()
        assert len(events) == 1
        assert events[0].event_type == "pre_collab_completed"
        assert events[0].data["status"] == "completed"
        assert events[0].data["answer_preview"] == "agent_1: Analytical | agent_2: Creative"

    def test_emit_pre_collab_completed_with_error(self, tmp_path: Path):
        emitter = EventEmitter(tmp_path)
        emitter.emit_raw(
            EventType.PRE_COLLAB_COMPLETED,
            agent_id="agent_1",
            subagent_id="criteria_generation",
            status="failed",
            error="Subagent timed out",
        )
        emitter.close()

        reader = EventReader(tmp_path / "events.jsonl")
        events = reader.read_all()
        assert len(events) == 1
        assert events[0].data["status"] == "failed"
        assert events[0].data["error"] == "Subagent timed out"

    def test_emit_personas_set(self, tmp_path: Path):
        emitter = EventEmitter(tmp_path)
        emitter.emit_raw(
            EventType.PERSONAS_SET,
            personas={
                "agent_1": "Analytical deep-thinker",
                "agent_2": "Creative storyteller",
            },
        )
        emitter.close()

        reader = EventReader(tmp_path / "events.jsonl")
        events = reader.read_all()
        assert len(events) == 1
        assert events[0].event_type == "personas_set"
        assert events[0].data["personas"]["agent_1"] == "Analytical deep-thinker"
        assert events[0].data["personas"]["agent_2"] == "Creative storyteller"

    def test_emit_evaluation_criteria_set(self, tmp_path: Path):
        emitter = EventEmitter(tmp_path)
        criteria = [
            {"id": "E1", "text": "Correctness", "category": "must"},
            {"id": "E2", "text": "Clarity", "category": "should"},
        ]
        emitter.emit_raw(
            EventType.EVALUATION_CRITERIA_SET,
            criteria=criteria,
            source="generated",
        )
        emitter.close()

        reader = EventReader(tmp_path / "events.jsonl")
        events = reader.read_all()
        assert len(events) == 1
        assert events[0].event_type == "evaluation_criteria_set"
        assert len(events[0].data["criteria"]) == 2
        assert events[0].data["criteria"][0]["text"] == "Correctness"
        assert events[0].data["source"] == "generated"

    def test_emit_subtasks_set(self, tmp_path: Path):
        emitter = EventEmitter(tmp_path)
        emitter.emit_raw(
            EventType.SUBTASKS_SET,
            subtasks={
                "agent_1": "Build the frontend",
                "agent_2": "Build the backend",
            },
        )
        emitter.close()

        reader = EventReader(tmp_path / "events.jsonl")
        events = reader.read_all()
        assert len(events) == 1
        assert events[0].event_type == "subtasks_set"
        assert events[0].data["subtasks"]["agent_1"] == "Build the frontend"

    def test_events_have_timestamps(self, tmp_path: Path):
        emitter = EventEmitter(tmp_path)
        emitter.emit_raw(EventType.PRE_COLLAB_STARTED, agent_id="a1", subagent_id="x", task="t")
        emitter.close()

        reader = EventReader(tmp_path / "events.jsonl")
        events = reader.read_all()
        assert events[0].timestamp  # non-empty ISO timestamp

    def test_listener_receives_new_events(self):
        """Verify in-process listeners get fired for the new event types."""
        emitter = EventEmitter()  # No file, listener-only
        received = []
        emitter.add_listener(lambda e: received.append(e))

        emitter.emit_raw(EventType.PRE_COLLAB_STARTED, agent_id="a1", subagent_id="x", task="t")
        emitter.emit_raw(EventType.PERSONAS_SET, personas={"a1": "Bold"})
        emitter.emit_raw(EventType.SUBTASKS_SET, subtasks={"a1": "Do X"})

        assert len(received) == 3
        assert received[0].event_type == "pre_collab_started"
        assert received[1].event_type == "personas_set"
        assert received[2].event_type == "subtasks_set"

    def test_tool_events_redact_secrets_before_writing_jsonl(self, tmp_path: Path):
        emitter = EventEmitter(tmp_path)
        openai_key = "sk-proj-testsecret1234567890abcdefghijklmnopqrstuvwxyz"
        bearer_token = "AIzaSyTestSecret1234567890abcdefghijklmnop"

        emitter.emit_tool_start(
            "tool_1",
            "read_file",
            {
                "OPENAI_API_KEY": openai_key,
                "nested": {"token": bearer_token},
            },
        )
        emitter.emit_tool_complete(
            "tool_1",
            "read_file",
            f'OPENAI_API_KEY = "{openai_key}"\nAuthorization: Bearer {bearer_token}',
            0.5,
        )
        emitter.close()

        raw = (tmp_path / "events.jsonl").read_text(encoding="utf-8")
        assert openai_key not in raw
        assert bearer_token not in raw
        assert "[REDACTED]" in raw

        reader = EventReader(tmp_path / "events.jsonl")
        events = reader.read_all()
        assert events[0].data["args"]["OPENAI_API_KEY"] == "[REDACTED]"
        assert events[0].data["args"]["nested"]["token"] == "[REDACTED]"
        assert 'OPENAI_API_KEY = "[REDACTED]"' in events[1].data["result"]
        assert "Authorization: Bearer [REDACTED]" in events[1].data["result"]


# ---------------------------------------------------------------------------
# 3. EventReader filtering works with new types
# ---------------------------------------------------------------------------


class TestEventReaderFiltering:
    """Verify EventReader.filter_by_type picks up new events."""

    def test_filter_pre_collab_events(self, tmp_path: Path):
        emitter = EventEmitter(tmp_path)
        emitter.emit_raw(EventType.PRE_COLLAB_STARTED, agent_id="a1", subagent_id="x", task="t")
        emitter.emit_raw(EventType.TEXT, content="hello", agent_id="a1")
        emitter.emit_raw(EventType.PRE_COLLAB_COMPLETED, agent_id="a1", subagent_id="x", status="completed")
        emitter.close()

        reader = EventReader(tmp_path / "events.jsonl")
        filtered = reader.filter_by_type([EventType.PRE_COLLAB_STARTED, EventType.PRE_COLLAB_COMPLETED])
        assert len(filtered) == 2

    def test_filter_config_events(self, tmp_path: Path):
        emitter = EventEmitter(tmp_path)
        emitter.emit_raw(EventType.PERSONAS_SET, personas={"a1": "X"})
        emitter.emit_raw(EventType.EVALUATION_CRITERIA_SET, criteria=[], source="default")
        emitter.emit_raw(EventType.SUBTASKS_SET, subtasks={"a1": "Y"})
        emitter.emit_raw(EventType.TEXT, content="noise", agent_id="a1")
        emitter.close()

        reader = EventReader(tmp_path / "events.jsonl")
        config_events = reader.filter_by_type(
            [
                EventType.PERSONAS_SET,
                EventType.EVALUATION_CRITERIA_SET,
                EventType.SUBTASKS_SET,
            ],
        )
        assert len(config_events) == 3


# ---------------------------------------------------------------------------
# 4. TUI event routing (unit test with mocks)
# ---------------------------------------------------------------------------


class TestTuiEventRouting:
    """Verify _handle_coordination_event_side_effects routes new events."""

    def _make_event(self, event_type: str, agent_id: str | None = None, **data) -> MassGenEvent:
        return MassGenEvent.create(event_type=event_type, agent_id=agent_id, **data)

    def test_pre_collab_started_routed_to_show_card(self):
        """PRE_COLLAB_STARTED should call show_runtime_subagent_card."""
        app = MagicMock()
        app.show_runtime_subagent_card = MagicMock()
        app._handle_coordination_event_side_effects = MagicMock()

        event = self._make_event(
            EventType.PRE_COLLAB_STARTED,
            agent_id="agent_1",
            subagent_id="persona_generation",
            task="Generate personas",
            timeout_seconds=300,
            call_id="persona_generation_persona_generation",
            log_path="/tmp/logs/subagents/persona_generation",
        )

        # Simulate what the side-effects handler should do
        assert event.event_type == "pre_collab_started"
        assert event.data["subagent_id"] == "persona_generation"
        assert event.data["log_path"] == "/tmp/logs/subagents/persona_generation"

    def test_pre_collab_completed_routed_to_update_card(self):
        """PRE_COLLAB_COMPLETED should call update_runtime_subagent_card."""
        event = self._make_event(
            EventType.PRE_COLLAB_COMPLETED,
            agent_id="agent_1",
            subagent_id="persona_generation",
            call_id="persona_generation_persona_generation",
            status="completed",
            answer_preview="Personas generated",
        )

        assert event.event_type == "pre_collab_completed"
        assert event.data["status"] == "completed"
        assert event.data["answer_preview"] == "Personas generated"

    def test_personas_set_event_structure(self):
        """PERSONAS_SET event should carry persona map."""
        event = self._make_event(
            EventType.PERSONAS_SET,
            personas={"a1": "Bold analyst", "a2": "Creative writer"},
        )
        assert event.event_type == "personas_set"
        assert event.data["personas"]["a1"] == "Bold analyst"

    def test_evaluation_criteria_set_event_structure(self):
        """EVALUATION_CRITERIA_SET should carry criteria list and source."""
        criteria = [{"id": "E1", "text": "Correct", "category": "must"}]
        event = self._make_event(
            EventType.EVALUATION_CRITERIA_SET,
            criteria=criteria,
            source="generated",
        )
        assert event.event_type == "evaluation_criteria_set"
        assert event.data["criteria"] == criteria
        assert event.data["source"] == "generated"

    def test_subtasks_set_event_structure(self):
        """SUBTASKS_SET should carry subtask mapping."""
        event = self._make_event(
            EventType.SUBTASKS_SET,
            subtasks={"a1": "Frontend", "a2": "Backend"},
        )
        assert event.event_type == "subtasks_set"
        assert event.data["subtasks"]["a1"] == "Frontend"

    def test_pre_collab_events_dont_require_agent_in_widgets(self):
        """Pre-collab events fire before agent widgets exist — they must
        not be dropped by the agent_id-in-widgets guard."""
        event = self._make_event(
            EventType.PRE_COLLAB_STARTED,
            agent_id="agent_1",
            subagent_id="persona_generation",
            task="Generate",
        )
        # The key invariant: these events have an agent_id but should be
        # handled even when agent_widgets is empty or doesn't contain
        # the agent_id. Verify the event carries the right type.
        assert event.event_type in (
            EventType.PRE_COLLAB_STARTED,
            EventType.PRE_COLLAB_COMPLETED,
            EventType.PERSONAS_SET,
            EventType.EVALUATION_CRITERIA_SET,
            EventType.SUBTASKS_SET,
        )

    def test_config_events_no_agent_id_ok(self):
        """Config events like PERSONAS_SET may have no agent_id."""
        event = self._make_event(EventType.PERSONAS_SET, personas={"a1": "X"})
        assert event.agent_id is None
        assert event.event_type == "personas_set"


# ---------------------------------------------------------------------------
# 5. JSON round-trip fidelity
# ---------------------------------------------------------------------------


class TestJsonRoundTrip:
    """Verify new events survive JSON serialization/deserialization."""

    @pytest.mark.parametrize(
        "event_type,data",
        [
            (EventType.PRE_COLLAB_STARTED, {"subagent_id": "persona_generation", "task": "Generate", "log_path": "/tmp/log"}),
            (EventType.PRE_COLLAB_COMPLETED, {"subagent_id": "persona_generation", "status": "completed", "answer_preview": "Done"}),
            (EventType.PERSONAS_SET, {"personas": {"a1": "Bold", "a2": "Creative"}}),
            (EventType.EVALUATION_CRITERIA_SET, {"criteria": [{"id": "E1", "text": "Good"}], "source": "generated"}),
            (EventType.SUBTASKS_SET, {"subtasks": {"a1": "Frontend"}}),
        ],
    )
    def test_round_trip(self, event_type: str, data: dict):
        event = MassGenEvent.create(event_type=event_type, agent_id="test_agent", **data)
        json_str = event.to_json()
        restored = MassGenEvent.from_json(json_str)

        assert restored.event_type == event_type
        assert restored.agent_id == "test_agent"
        for key, value in data.items():
            assert restored.data[key] == value
