"""Tests for standalone MCP servers (massgen-refinery plugin support)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from massgen.mcp_tools.standalone.quality_server import (
    _draft_approach_impl,
    _extract_score,
    _find_plateaued,
    _generate_eval_criteria_impl,
    _get_session_dir,
    _init_session_impl,
    _read_criteria,
    _read_state,
    _reset_evaluation_impl,
    _safe_session_id,
    _submit_checklist_impl,
    _write_state,
)
from massgen.mcp_tools.standalone.workflow_server import (
    _new_answer_impl,
    _vote_impl,
)

# ---------------------------------------------------------------------------
# quality_server — unit tests
# ---------------------------------------------------------------------------


class TestExtractScore:
    def test_int(self):
        assert _extract_score(7) == 7

    def test_float(self):
        assert _extract_score(8.5) == 8

    def test_dict_with_score(self):
        assert _extract_score({"score": 6, "reasoning": "good"}) == 6

    def test_dict_missing_score(self):
        assert _extract_score({"reasoning": "ok"}) == 0

    def test_string_returns_zero(self):
        assert _extract_score("high") == 0


class TestFindPlateaued:
    def test_no_history(self):
        current = [{"id": "E1", "score": 5}]
        assert _find_plateaued(current, []) == []

    def test_insufficient_history(self):
        current = [{"id": "E1", "score": 5}]
        history = [{"items_detail": [{"id": "E1", "score": 4}]}]
        assert _find_plateaued(current, history) == []

    def test_plateaued_detected(self):
        current = [{"id": "E1", "score": 5}]
        history = [
            {"items_detail": [{"id": "E1", "score": 5}]},
            {"items_detail": [{"id": "E1", "score": 5}]},
        ]
        result = _find_plateaued(current, history)
        assert len(result) == 1
        assert result[0]["id"] == "E1"

    def test_not_plateaued_when_improving(self):
        current = [{"id": "E1", "score": 8}]
        history = [
            {"items_detail": [{"id": "E1", "score": 4}]},
            {"items_detail": [{"id": "E1", "score": 5}]},
        ]
        result = _find_plateaued(current, history)
        assert len(result) == 0


class TestSafeSessionId:
    def test_valid_id_unchanged(self):
        assert _safe_session_id("20260318_123456_landing-page") == "20260318_123456_landing-page"

    def test_strips_path_traversal(self):
        result = _safe_session_id("../../evil")
        assert ".." not in result
        assert "/" not in result

    def test_empty_falls_back_to_default(self):
        assert _safe_session_id("") == "default"
        assert _safe_session_id("...") == "default"

    def test_dots_only_falls_back_to_default(self):
        assert _safe_session_id("..") == "default"
        assert _safe_session_id(".") == "default"


class TestSessionDir:
    def test_creates_default_dir(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        session_dir = _get_session_dir()
        assert session_dir.exists()
        assert "default" in str(session_dir)

    def test_reads_session_metadata(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        quality_dir = tmp_path / ".massgen-quality"
        quality_dir.mkdir()
        (quality_dir / "session_metadata.json").write_text(
            json.dumps({"session_id": "test-session-123"}),
        )
        session_dir = _get_session_dir()
        assert "test-session-123" in str(session_dir)
        assert session_dir.exists()

    def test_sanitizes_malicious_session_id(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        quality_dir = tmp_path / ".massgen-quality"
        quality_dir.mkdir()
        (quality_dir / "session_metadata.json").write_text(
            json.dumps({"session_id": "../../evil"}),
        )
        session_dir = _get_session_dir()
        sessions_root = (quality_dir / "sessions").resolve()
        assert session_dir.resolve().is_relative_to(sessions_root)


class TestCriteriaStorage:
    def test_write_and_read_criteria(self, tmp_path):
        criteria = [
            {"id": "E1", "text": "Goal alignment", "category": "must"},
            {"id": "E2", "text": "Correctness", "category": "must"},
        ]
        criteria_path = tmp_path / "criteria.json"
        criteria_path.write_text(json.dumps(criteria))

        loaded = _read_criteria(tmp_path)
        assert len(loaded) == 2
        assert loaded[0]["id"] == "E1"

    def test_read_missing_criteria(self, tmp_path):
        assert _read_criteria(tmp_path) == []


class TestStateManagement:
    def test_write_and_read_state(self, tmp_path):
        state = {"checklist_history": [], "last_result": None, "round": 1}
        _write_state(tmp_path, state)

        loaded = _read_state(tmp_path)
        assert loaded["round"] == 1

    def test_read_missing_state(self, tmp_path):
        state = _read_state(tmp_path)
        assert state["round"] == 0
        assert state["checklist_history"] == []


# ---------------------------------------------------------------------------
# quality_server — tool integration tests (async)
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_init_session_creates_timestamped_dir(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    result = json.loads(await _init_session_impl(label="landing-page"))

    assert result["status"] == "ok"
    assert "landing-page" in result["session_id"]
    assert Path(result["session_dir"]).exists()

    # session_metadata.json should point to this session
    metadata = json.loads((tmp_path / ".massgen-quality" / "session_metadata.json").read_text())
    assert metadata["session_id"] == result["session_id"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_init_session_without_label(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    result = json.loads(await _init_session_impl())

    assert result["status"] == "ok"
    # Should be a pure timestamp like 20260316_191500
    assert "_" in result["session_id"]
    assert len(result["session_id"]) == 15  # YYYYMMDD_HHMMSS


@pytest.mark.integration
@pytest.mark.asyncio
async def test_init_session_then_tools_use_it(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    # Init session
    session_result = json.loads(await _init_session_impl(label="test"))
    session_id = session_result["session_id"]

    # Store criteria — should go in the timestamped session dir
    await _generate_eval_criteria_impl([{"id": "E1", "text": "Goal alignment"}])

    # Verify criteria landed in the right session
    criteria_path = tmp_path / ".massgen-quality" / "sessions" / session_id / "criteria.json"
    assert criteria_path.exists()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_generate_eval_criteria(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    generate_eval_criteria = _generate_eval_criteria_impl

    criteria = [
        {"id": "E1", "text": "Goal alignment", "category": "must"},
        {"id": "E2", "text": "Correctness", "category": "must"},
        {"id": "E3", "text": "Depth", "category": "must"},
    ]
    result_json = await generate_eval_criteria(criteria)
    result = json.loads(result_json)

    assert result["status"] == "ok"
    assert result["criteria_count"] == 3


@pytest.mark.integration
@pytest.mark.asyncio
async def test_generate_eval_criteria_rejects_invalid(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    generate_eval_criteria = _generate_eval_criteria_impl

    result = json.loads(await generate_eval_criteria([]))
    assert result["status"] == "error"

    result = json.loads(await generate_eval_criteria([{"id": "E1"}]))
    assert result["status"] == "error"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_submit_checklist_iterate(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    generate_eval_criteria = _generate_eval_criteria_impl
    submit_checklist = _submit_checklist_impl

    # Register criteria
    await generate_eval_criteria(
        [
            {"id": "E1", "text": "Goal alignment"},
            {"id": "E2", "text": "Correctness"},
        ],
    )

    # Submit scores below cutoff
    result = json.loads(
        await submit_checklist(
            scores={"E1": 5, "E2": 8},
        ),
    )

    assert result["status"] == "accepted"
    assert result["verdict"] == "iterate"
    assert "E1" in result["failed_criteria"]
    assert "E2" not in result["failed_criteria"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_submit_checklist_converge(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    generate_eval_criteria = _generate_eval_criteria_impl
    submit_checklist = _submit_checklist_impl

    await generate_eval_criteria(
        [
            {"id": "E1", "text": "Goal alignment"},
            {"id": "E2", "text": "Correctness"},
        ],
    )

    result = json.loads(
        await submit_checklist(
            scores={"E1": 8, "E2": 9},
        ),
    )

    assert result["status"] == "accepted"
    assert result["verdict"] == "converge"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_submit_checklist_no_criteria(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    submit_checklist = _submit_checklist_impl

    result = json.loads(await submit_checklist(scores={"E1": 80}))
    assert result["status"] == "error"
    assert "No criteria" in result["error"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_submit_checklist_with_reasoning(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    generate_eval_criteria = _generate_eval_criteria_impl
    submit_checklist = _submit_checklist_impl

    await generate_eval_criteria([{"id": "E1", "text": "Goal alignment"}])

    result = json.loads(
        await submit_checklist(
            scores={"E1": {"score": 8, "reasoning": "Meets all requirements"}},
        ),
    )

    assert result["status"] == "accepted"
    assert result["verdict"] == "converge"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_draft_approach_valid(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    generate_eval_criteria = _generate_eval_criteria_impl
    submit_checklist = _submit_checklist_impl
    draft_approach = _draft_approach_impl

    await generate_eval_criteria(
        [
            {"id": "E1", "text": "Goal alignment"},
            {"id": "E2", "text": "Correctness"},
        ],
    )

    await submit_checklist(scores={"E1": 4, "E2": 8})

    result = json.loads(
        await draft_approach(
            improvements={
                "E1": [{"plan": "Redesign navigation", "impact": "structural"}],
            },
        ),
    )

    assert result["valid"] is True


@pytest.mark.integration
@pytest.mark.asyncio
async def test_draft_approach_missing_coverage(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    generate_eval_criteria = _generate_eval_criteria_impl
    submit_checklist = _submit_checklist_impl
    draft_approach = _draft_approach_impl

    await generate_eval_criteria(
        [
            {"id": "E1", "text": "Goal alignment"},
            {"id": "E2", "text": "Correctness"},
        ],
    )

    await submit_checklist(scores={"E1": 4, "E2": 4})

    # Only cover E1, not E2
    result = json.loads(
        await draft_approach(
            improvements={
                "E1": [{"plan": "Fix it", "impact": "structural"}],
            },
        ),
    )

    assert result["valid"] is False
    assert "E2" in result["missing_criteria"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_draft_approach_rejects_all_incremental(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    generate_eval_criteria = _generate_eval_criteria_impl
    submit_checklist = _submit_checklist_impl
    draft_approach = _draft_approach_impl

    await generate_eval_criteria([{"id": "E1", "text": "Goal alignment"}])
    await submit_checklist(scores={"E1": 4})

    result = json.loads(
        await draft_approach(
            improvements={
                "E1": [{"plan": "Tweak CSS", "impact": "incremental"}],
            },
        ),
    )

    assert result["valid"] is False
    assert "incremental" in result["error"].lower()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_reset_evaluation(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    generate_eval_criteria = _generate_eval_criteria_impl
    submit_checklist = _submit_checklist_impl
    reset_evaluation = _reset_evaluation_impl

    await generate_eval_criteria([{"id": "E1", "text": "Goal alignment"}])
    await submit_checklist(scores={"E1": 8})

    result = json.loads(await reset_evaluation())
    assert result["status"] == "ok"

    # State should be cleared
    state = _read_state(_get_session_dir())
    assert state["round"] == 0
    assert state["checklist_history"] == []


# ---------------------------------------------------------------------------
# workflow_server — tool tests
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.asyncio
async def test_new_answer_snapshots_deliverables(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    # Init a session first
    await _init_session_impl(label="snapshot-test")

    # Create deliverable files
    (tmp_path / "index.html").write_text("<h1>Hello</h1>")
    (tmp_path / "styles.css").write_text("body { color: red; }")

    result = json.loads(
        await _new_answer_impl(
            answer="Built the landing page",
            file_paths=["index.html", "styles.css"],
        ),
    )

    assert result["status"] == "ok"
    assert result["tool_name"] == "new_answer"
    assert result["round"] == 1
    assert len(result["snapshots"]) == 2

    # Verify files were snapshotted into the round directory
    round_dir = Path(result["round_dir"])
    assert (round_dir / "deliverables" / "index.html").exists()
    assert (round_dir / "deliverables" / "styles.css").exists()
    assert (round_dir / "submission.json").exists()
    assert (round_dir / ".scratch" / "verification").is_dir()

    # Verify submission manifest
    manifest = json.loads((round_dir / "submission.json").read_text())
    assert manifest["round"] == 1
    assert manifest["answer_summary"] == "Built the landing page"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_new_answer_without_files(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    await _init_session_impl(label="no-files")

    result = json.loads(
        await _new_answer_impl(
            answer="Described the approach",
        ),
    )

    assert result["status"] == "ok"
    assert result["snapshots"] == []


@pytest.mark.integration
@pytest.mark.asyncio
async def test_vote():
    vote = _vote_impl

    result = json.loads(
        await vote(
            choice="accept",
            reasoning="All criteria met",
        ),
    )

    assert result["status"] == "ok"
    assert result["tool_name"] == "vote"
    assert result["arguments"]["choice"] == "accept"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_new_answer_rejects_path_outside_workspace(tmp_path, monkeypatch, tmp_path_factory):
    monkeypatch.chdir(tmp_path)
    await _init_session_impl(label="traversal-test")

    # Create a file strictly outside the workspace (tmp_path)
    outside_dir = tmp_path_factory.mktemp("outside")
    outside_file = outside_dir / "secret.txt"
    outside_file.write_text("secret content")

    result = json.loads(
        await _new_answer_impl(
            answer="test",
            file_paths=[str(outside_file)],
        ),
    )

    assert result["status"] == "ok"
    assert len(result["snapshots"]) == 0
