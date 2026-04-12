"""Tests for WebUI review modal backend plumbing."""

import asyncio
import json
from unittest.mock import MagicMock, patch

import pytest


class TestCoordinationConfigWebReview:
    """Test web_review field on CoordinationConfig."""

    def test_default_false(self):
        from massgen.agent_config import CoordinationConfig

        config = CoordinationConfig()
        assert config.web_review is False

    def test_set_true(self):
        from massgen.agent_config import CoordinationConfig

        config = CoordinationConfig(web_review=True)
        assert config.web_review is True

    def test_parse_coordination_config_web_review(self):
        from massgen.cli import _parse_coordination_config

        coord_cfg = {"web_review": True}
        config = _parse_coordination_config(coord_cfg)
        assert config.web_review is True

    def test_parse_coordination_config_web_review_default(self):
        from massgen.cli import _parse_coordination_config

        coord_cfg = {}
        config = _parse_coordination_config(coord_cfg)
        assert config.web_review is False


class TestWebDisplayReview:
    """Test WebDisplay review modal methods."""

    def _make_display(self, review_enabled=False):
        from massgen.frontend.displays.web_display import WebDisplay

        display = WebDisplay(
            agent_ids=["agent_a", "agent_b"],
            broadcast=None,
            session_id="test-session",
            review_enabled=review_enabled,
        )
        return display

    def test_review_disabled_by_default(self):
        display = self._make_display()
        assert display._review_enabled is False
        assert display._review_future is None
        assert display._pending_review_data is None

    def test_review_enabled(self):
        display = self._make_display(review_enabled=True)
        assert display._review_enabled is True

    @pytest.mark.asyncio
    async def test_show_final_answer_modal_auto_approves_when_disabled(self):
        display = self._make_display(review_enabled=False)
        result = await display.show_final_answer_modal(
            changes=[],
            answer_content="test answer",
            vote_results={},
            agent_id="agent_a",
        )
        assert result.approved is True
        assert result.metadata.get("auto_approved") is True

    @pytest.mark.asyncio
    async def test_show_final_answer_modal_emits_event_when_enabled(self):
        display = self._make_display(review_enabled=True)
        emitted_events = []
        original_emit = display._emit

        def capture_emit(event_type, data):
            emitted_events.append((event_type, data))
            original_emit(event_type, data)

        display._emit = capture_emit

        # Set up mock orchestrator to avoid AttributeError
        mock_orch = MagicMock()
        mock_orch._review_pending = False
        display.orchestrator = mock_orch

        # Start the modal in a task, then resolve it
        async def resolve_after_delay():
            await asyncio.sleep(0.05)
            display.resolve_review({"approved": True, "action": "approve"}, source="test")

        task = asyncio.create_task(resolve_after_delay())

        result = await display.show_final_answer_modal(
            changes=[{"changes": [{"path": "foo.py", "status": "M"}], "diff": "diff"}],
            answer_content="test answer",
            vote_results={"vote_counts": {"agent_a": 2}},
            agent_id="agent_a",
        )
        await task

        assert result.approved is True
        # Check that review_request event was emitted
        review_events = [e for e in emitted_events if e[0] == "review_request"]
        assert len(review_events) == 1
        assert review_events[0][1]["agent_id"] == "agent_a"
        assert review_events[0][1]["answer_content"] == "test answer"

    @pytest.mark.asyncio
    async def test_show_final_answer_modal_writes_review_request_json(self, tmp_path):
        display = self._make_display(review_enabled=True)
        display.log_session_dir = tmp_path
        mock_orch = MagicMock()
        mock_orch._review_pending = False
        display.orchestrator = mock_orch

        async def resolve_after_delay():
            await asyncio.sleep(0.05)
            display.resolve_review({"approved": True}, source="test")

        task = asyncio.create_task(resolve_after_delay())
        await display.show_final_answer_modal(
            changes=[{"changes": [{"path": "bar.py", "status": "A"}], "diff": ""}],
            answer_content="answer text",
            vote_results={},
            agent_id="agent_a",
        )
        await task

        request_file = tmp_path / "review_request.json"
        assert request_file.exists()
        data = json.loads(request_file.read_text())
        assert data["review_pending"] is True
        assert len(data["files"]) == 1
        assert data["files"][0]["path"] == "bar.py"

        result_file = tmp_path / "review_result.json"
        assert result_file.exists()
        result_data = json.loads(result_file.read_text())
        assert result_data["approved"] is True

    def test_resolve_review_builds_review_result(self):
        display = self._make_display(review_enabled=True)
        loop = asyncio.new_event_loop()
        display._review_future = loop.create_future()

        display.resolve_review(
            {"approved": True, "approved_files": ["a.py"], "action": "approve"},
            source="webui",
        )

        assert display._review_future.done()
        result = display._review_future.result()
        assert result.approved is True
        assert result.approved_files == ["a.py"]
        assert result._resolved_by == "webui"
        loop.close()

    def test_resolve_review_is_idempotent(self):
        display = self._make_display(review_enabled=True)
        loop = asyncio.new_event_loop()
        display._review_future = loop.create_future()

        display.resolve_review({"approved": True}, source="webui")
        # Second call should be a no-op (no exception)
        display.resolve_review({"approved": False}, source="api")

        result = display._review_future.result()
        assert result.approved is True  # First call wins
        loop.close()

    def test_resolve_review_noop_when_no_future(self):
        display = self._make_display(review_enabled=True)
        assert display._review_future is None
        # Should not raise
        display.resolve_review({"approved": True}, source="test")

    def test_get_state_snapshot_includes_review_data(self):
        display = self._make_display(review_enabled=True)
        display._pending_review_data = {
            "changes": [{"diff": "test"}],
            "agent_id": "agent_a",
        }

        snapshot = display.get_state_snapshot()
        assert snapshot["review_pending"] is True
        assert snapshot["review_request"]["agent_id"] == "agent_a"

    def test_get_state_snapshot_no_review_data(self):
        display = self._make_display(review_enabled=True)
        snapshot = display.get_state_snapshot()
        assert "review_pending" not in snapshot

    @pytest.mark.asyncio
    async def test_show_final_answer_modal_timeout(self):
        """Test that the modal times out and returns rejected."""
        display = self._make_display(review_enabled=True)
        mock_orch = MagicMock()
        mock_orch._review_pending = False
        display.orchestrator = mock_orch

        # Patch the timeout to be very short
        with patch("massgen.frontend.displays.web_display.asyncio.wait_for") as mock_wait:
            mock_wait.side_effect = asyncio.TimeoutError()
            result = await display.show_final_answer_modal(
                changes=[],
                answer_content="",
                vote_results={},
                agent_id="agent_a",
            )

        assert result.approved is False
        assert result.metadata.get("error") == "timeout"


class TestCoordinationTrackerReviewPending:
    """Test waiting_for_review finish_reason in status.json."""

    def _make_tracker_and_orch(self, review_pending):
        from massgen.coordination_tracker import CoordinationTracker

        tracker = CoordinationTracker()
        tracker.agent_ids = ["agent_a"]
        tracker.user_prompt = "test"

        mock_orch = MagicMock()
        mock_orch.is_orchestrator_timeout = False
        mock_orch._review_pending = review_pending
        mock_orch.timeout_reason = None
        # Ensure agent_states returns clean dicts (no auto-mock truthy values)
        mock_orch.agent_states = {}
        return tracker, mock_orch

    def test_review_pending_in_status(self, tmp_path):
        tracker, mock_orch = self._make_tracker_and_orch(review_pending=True)
        tracker.save_status_file(tmp_path, mock_orch)

        status_file = tmp_path / "status.json"
        assert status_file.exists()
        data = json.loads(status_file.read_text())
        assert data["finish_reason"] == "waiting_for_review"
        assert data["review_pending"] is True
        assert data["is_complete"] is False

    def test_no_review_pending_in_status(self, tmp_path):
        tracker, mock_orch = self._make_tracker_and_orch(review_pending=False)
        tracker.save_status_file(tmp_path, mock_orch)

        status_file = tmp_path / "status.json"
        data = json.loads(status_file.read_text())
        assert data["finish_reason"] == "in_progress"
        assert data["review_pending"] is False


class TestCliWebReviewFlag:
    """Test --web-review CLI flag wiring."""

    def test_build_cli_overrides_dict_includes_web_review(self):
        import argparse

        from massgen.cli import _build_cli_overrides_dict

        args = argparse.Namespace(
            eval_criteria=None,
            checklist_criteria_preset=None,
            orchestrator_timeout=None,
            cwd_context=None,
            web_review=True,
        )
        overrides = _build_cli_overrides_dict(args)
        assert overrides.get("web_review") is True

    def test_build_cli_overrides_dict_omits_web_review_when_false(self):
        import argparse

        from massgen.cli import _build_cli_overrides_dict

        args = argparse.Namespace(
            eval_criteria=None,
            checklist_criteria_preset=None,
            orchestrator_timeout=None,
            cwd_context=None,
            web_review=False,
        )
        overrides = _build_cli_overrides_dict(args)
        assert "web_review" not in overrides
