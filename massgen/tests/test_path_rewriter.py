"""Tests for stale workspace path rewriting in framework metadata files.

TDD: Tests written first, then implementation follows.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import pytest

from massgen.filesystem_manager._path_rewriter import (
    _SCAN_DIRS,
    replace_stale_paths_in_workspace,
    scrub_agent_ids_in_snapshot,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_framework_file(workspace: Path, rel_path: str, content: str) -> Path:
    """Create a file inside the workspace at rel_path with given content."""
    fp = workspace / rel_path
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_text(content, encoding="utf-8")
    return fp


# ---------------------------------------------------------------------------
# Unit tests for replace_stale_paths_in_workspace
# ---------------------------------------------------------------------------


class TestReplaceStalePathsInWorkspace:
    """Unit tests for the path rewriter."""

    def test_replaces_paths_in_memory_dir(self, tmp_path: Path) -> None:
        """Replaces stale paths in memory/short_term/verification_latest.md."""
        stale = "/tmp/old_workspace/workspace_abc123"
        new = str(tmp_path / "dest_workspace")
        content = f"- Workspace: {stale}\n1. `cd {stale}`\n"
        _make_framework_file(
            tmp_path,
            "memory/short_term/verification_latest.md",
            content,
        )

        count = replace_stale_paths_in_workspace(tmp_path, {stale: new})

        assert count == 1
        result = (tmp_path / "memory/short_term/verification_latest.md").read_text()
        assert stale not in result
        assert new in result

    def test_replaces_paths_in_massgen_scratch(self, tmp_path: Path) -> None:
        """Replaces stale paths in .massgen_scratch/ files."""
        stale = "/tmp/old_workspace/workspace_xyz"
        new = "/tmp/new_workspace"
        content = f"Verification output referencing {stale}/file.txt\n"
        _make_framework_file(
            tmp_path,
            ".massgen_scratch/verification/output_test.txt",
            content,
        )

        count = replace_stale_paths_in_workspace(tmp_path, {stale: new})

        assert count == 1
        result = (tmp_path / ".massgen_scratch/verification/output_test.txt").read_text()
        assert stale not in result
        assert f"{new}/file.txt" in result

    def test_replaces_paths_in_tool_results(self, tmp_path: Path) -> None:
        """Replaces stale paths in .tool_results/ files."""
        stale = "/home/user/workspaces/ws_001"
        new = "/session/agents/agent_a/001/workspace"
        content = f"Tool output: saved to {stale}/output.json\n"
        _make_framework_file(tmp_path, ".tool_results/result_001.txt", content)

        count = replace_stale_paths_in_workspace(tmp_path, {stale: new})

        assert count == 1
        result = (tmp_path / ".tool_results/result_001.txt").read_text()
        assert f"{new}/output.json" in result

    def test_does_not_touch_root_level_deliverables(self, tmp_path: Path) -> None:
        """Root-level files (agent deliverables) must NOT be rewritten."""
        stale = "/tmp/old_workspace"
        new = "/tmp/new_workspace"
        content = f"This deliverable references {stale}\n"
        _make_framework_file(tmp_path, "README.md", content)
        # Also create a scanned dir file to ensure the function runs
        _make_framework_file(tmp_path, "memory/note.md", "no match here")

        count = replace_stale_paths_in_workspace(tmp_path, {stale: new})

        assert count == 0
        result = (tmp_path / "README.md").read_text()
        assert stale in result  # Unchanged

    def test_skips_binary_extensions(self, tmp_path: Path) -> None:
        """Files with binary extensions (.png, etc.) are skipped."""
        stale = "/tmp/old_workspace"
        new = "/tmp/new_workspace"
        # Write a text file with a binary extension in a scanned dir
        _make_framework_file(
            tmp_path,
            "memory/image.png",
            f"fake png with {stale}",
        )

        count = replace_stale_paths_in_workspace(tmp_path, {stale: new})

        assert count == 0

    def test_skips_files_over_size_limit(self, tmp_path: Path) -> None:
        """Files larger than MAX_FILE_SIZE_FOR_PATH_REWRITE are skipped."""
        from massgen.filesystem_manager._path_rewriter import (
            MAX_FILE_SIZE_FOR_PATH_REWRITE,
        )

        stale = "/tmp/old_workspace"
        new = "/tmp/new_workspace"
        # Create a file just over the limit
        big_content = f"{stale}\n" + "x" * (MAX_FILE_SIZE_FOR_PATH_REWRITE + 1)
        _make_framework_file(tmp_path, "memory/big_file.md", big_content)

        count = replace_stale_paths_in_workspace(tmp_path, {stale: new})

        assert count == 0
        result = (tmp_path / "memory/big_file.md").read_text()
        assert stale in result  # Unchanged

    def test_no_write_when_no_matches(self, tmp_path: Path) -> None:
        """File mtime should not change when no stale paths match."""
        content = "No stale paths here at all.\n"
        fp = _make_framework_file(tmp_path, "memory/clean.md", content)

        # Record mtime before
        mtime_before = os.path.getmtime(fp)
        # Small sleep to ensure mtime would differ if rewritten
        time.sleep(0.05)

        count = replace_stale_paths_in_workspace(
            tmp_path,
            {"/nonexistent/path": "/new/path"},
        )

        assert count == 0
        mtime_after = os.path.getmtime(fp)
        assert mtime_before == mtime_after

    def test_empty_replacements_is_noop(self, tmp_path: Path) -> None:
        """Empty replacements dict should be a no-op."""
        _make_framework_file(tmp_path, "memory/note.md", "some content\n")

        count = replace_stale_paths_in_workspace(tmp_path, {})

        assert count == 0

    def test_multiple_stale_paths_in_same_file(self, tmp_path: Path) -> None:
        """Multiple different stale paths in one file are all replaced."""
        stale1 = "/tmp/workspace_aaa"
        stale2 = "/tmp/workspace_bbb"
        new = "/session/workspace"
        content = f"Path1: {stale1}\nPath2: {stale2}\n"
        _make_framework_file(tmp_path, "memory/multi.md", content)

        count = replace_stale_paths_in_workspace(
            tmp_path,
            {stale1: new, stale2: new},
        )

        assert count == 1
        result = (tmp_path / "memory/multi.md").read_text()
        assert stale1 not in result
        assert stale2 not in result
        assert result.count(new) == 2

    def test_longest_first_prevents_partial_match(self, tmp_path: Path) -> None:
        """Longest replacement key is applied first to prevent corruption."""
        short_path = "/tmp/workspace"
        long_path = "/tmp/workspace/subdir"
        new_short = "/new/ws"
        new_long = "/new/ws/sub"
        # The file contains the long path — if short replaces first,
        # we'd get "/new/ws/subdir" instead of "/new/ws/sub"
        content = f"Reference: {long_path}/file.txt\n"
        _make_framework_file(tmp_path, "memory/ordering.md", content)

        count = replace_stale_paths_in_workspace(
            tmp_path,
            {short_path: new_short, long_path: new_long},
        )

        assert count == 1
        result = (tmp_path / "memory/ordering.md").read_text()
        assert result == "Reference: /new/ws/sub/file.txt\n"

    def test_non_utf8_file_does_not_crash(self, tmp_path: Path) -> None:
        """Binary content that isn't valid UTF-8 should be silently skipped."""
        fp = tmp_path / "memory"
        fp.mkdir(parents=True, exist_ok=True)
        binary_file = fp / "binary_data.md"
        binary_file.write_bytes(b"\x80\x81\x82\xff" * 100)

        # Should not raise
        count = replace_stale_paths_in_workspace(
            tmp_path,
            {"/tmp/old": "/tmp/new"},
        )

        assert count == 0

    def test_skips_skip_dirs_for_logging(self, tmp_path: Path) -> None:
        """Directories in SKIP_DIRS_FOR_LOGGING within scan dirs are skipped."""
        stale = "/tmp/old_workspace"
        new = "/tmp/new_workspace"
        # node_modules inside memory/ — should be skipped
        _make_framework_file(
            tmp_path,
            "memory/node_modules/package/file.txt",
            f"has {stale}",
        )

        count = replace_stale_paths_in_workspace(tmp_path, {stale: new})

        assert count == 0

    def test_scan_dirs_constant_matches_spec(self) -> None:
        """Verify _SCAN_DIRS contains the expected directories."""
        assert "memory" in _SCAN_DIRS
        assert ".massgen_scratch" in _SCAN_DIRS
        assert ".tool_results" in _SCAN_DIRS

    def test_workspace_root_does_not_exist(self, tmp_path: Path) -> None:
        """Non-existent workspace root returns 0 without error."""
        count = replace_stale_paths_in_workspace(
            tmp_path / "nonexistent",
            {"/old": "/new"},
        )
        assert count == 0


# ---------------------------------------------------------------------------
# Step mode integration test
# ---------------------------------------------------------------------------


class TestStepModePathRewriting:
    """Integration test: save_step_mode_output rewrites paths in workspace files."""

    def test_save_step_mode_output_rewrites_workspace_files(
        self,
        tmp_path: Path,
    ) -> None:
        """After save_step_mode_output, verification files in copied workspace
        have stale paths replaced with the session dir workspace path."""
        from massgen.step_mode import save_step_mode_output

        session_dir = tmp_path / "session"
        session_dir.mkdir()

        # Create a fake source workspace with a verification file
        source_ws = tmp_path / "source_workspace"
        source_ws.mkdir()
        stale_path = str(source_ws)
        verification_file = source_ws / "memory" / "short_term" / "verification_latest.md"
        verification_file.parent.mkdir(parents=True, exist_ok=True)
        verification_file.write_text(
            f"- Workspace: {stale_path}\n" f"1. `cd {stale_path}`\n",
        )

        step_dir = save_step_mode_output(
            session_dir=str(session_dir),
            agent_id="agent_a",
            action="new_answer",
            answer_text=f"My answer referencing {stale_path}",
            vote_target=None,
            vote_reason=None,
            seen_steps=None,
            duration_seconds=1.0,
            workspace_source=stale_path,
            stale_workspace_paths=[],
        )

        # The workspace was copied to step_dir/workspace
        copied_verification = step_dir / "workspace" / "memory" / "short_term" / "verification_latest.md"
        assert copied_verification.exists()

        content = copied_verification.read_text()
        ws_dest = str(step_dir / "workspace")
        assert stale_path not in content
        assert ws_dest in content


# ---------------------------------------------------------------------------
# Unit tests for scrub_agent_ids_in_snapshot
# ---------------------------------------------------------------------------


class TestScrubAgentIdsInSnapshot:
    """Unit tests for scrubbing real agent IDs from snapshot copies."""

    def test_renames_verification_memory_files(self, tmp_path: Path) -> None:
        """Files like verification_latest__agent_a.md get renamed to anon ID."""
        _make_framework_file(
            tmp_path,
            "memory/short_term/verification_latest__agent_a.md",
            "some verification content",
        )
        mapping = {"agent_a": "agent1"}

        count = scrub_agent_ids_in_snapshot(tmp_path, mapping)

        assert count > 0
        assert not (tmp_path / "memory/short_term/verification_latest__agent_a.md").exists()
        assert (tmp_path / "memory/short_term/verification_latest__agent1.md").exists()
        assert (tmp_path / "memory/short_term/verification_latest__agent1.md").read_text() == "some verification content"

    def test_replaces_agent_id_in_plan_json(self, tmp_path: Path) -> None:
        """Content in tasks/ dir has real agent IDs replaced."""
        _make_framework_file(
            tmp_path,
            "tasks/plan.json",
            '{"assigned_to": "agent_a", "delegated_by": "agent_b"}',
        )
        mapping = {"agent_a": "agent1", "agent_b": "agent2"}

        scrub_agent_ids_in_snapshot(tmp_path, mapping)

        result = (tmp_path / "tasks/plan.json").read_text()
        assert "agent_a" not in result
        assert "agent_b" not in result
        assert "agent1" in result
        assert "agent2" in result

    def test_replaces_agent_id_in_execution_trace(self, tmp_path: Path) -> None:
        """Root-level execution_trace.md gets scrubbed."""
        _make_framework_file(
            tmp_path,
            "execution_trace.md",
            "## Round 1\nagent_a submitted answer\nagent_b voted",
        )
        mapping = {"agent_a": "agent1", "agent_b": "agent2"}

        count = scrub_agent_ids_in_snapshot(tmp_path, mapping)

        assert count > 0
        result = (tmp_path / "execution_trace.md").read_text()
        assert "agent_a" not in result
        assert "agent_b" not in result

    def test_replaces_agent_id_in_memory_files(self, tmp_path: Path) -> None:
        """Content in memory/ dir has real agent IDs replaced."""
        _make_framework_file(
            tmp_path,
            "memory/short_term/notes.md",
            "Observed agent_c's approach was strong",
        )
        mapping = {"agent_c": "agent3"}

        scrub_agent_ids_in_snapshot(tmp_path, mapping)

        result = (tmp_path / "memory/short_term/notes.md").read_text()
        assert "agent_c" not in result
        assert "agent3" in result

    def test_does_not_touch_deliverable_files(self, tmp_path: Path) -> None:
        """Root-level README.md (a deliverable) is NOT modified."""
        _make_framework_file(
            tmp_path,
            "README.md",
            "Created by agent_a with love",
        )
        # Need at least one framework file so the function runs
        _make_framework_file(tmp_path, "memory/note.md", "clean")

        scrub_agent_ids_in_snapshot(tmp_path, {"agent_a": "agent1"})

        result = (tmp_path / "README.md").read_text()
        assert "agent_a" in result  # Unchanged

    def test_does_not_touch_deliverable_subdirs(self, tmp_path: Path) -> None:
        """Files in deliverable/ subdirectory are NOT modified."""
        _make_framework_file(
            tmp_path,
            "deliverable/report.md",
            "agent_a analysis results",
        )
        _make_framework_file(tmp_path, "memory/note.md", "clean")

        scrub_agent_ids_in_snapshot(tmp_path, {"agent_a": "agent1"})

        result = (tmp_path / "deliverable/report.md").read_text()
        assert "agent_a" in result  # Unchanged

    def test_multiple_agent_ids_replaced(self, tmp_path: Path) -> None:
        """All 3 agent IDs in one file are replaced."""
        content = "agent_a scored 9, agent_b scored 7, agent_c scored 8"
        _make_framework_file(tmp_path, "memory/eval.md", content)

        mapping = {"agent_a": "agent1", "agent_b": "agent2", "agent_c": "agent3"}
        scrub_agent_ids_in_snapshot(tmp_path, mapping)

        result = (tmp_path / "memory/eval.md").read_text()
        assert "agent_a" not in result
        assert "agent_b" not in result
        assert "agent_c" not in result
        assert "agent1" in result
        assert "agent2" in result
        assert "agent3" in result

    def test_longest_first_prevents_partial_match(self, tmp_path: Path) -> None:
        """agent_ab is replaced before agent_a to prevent partial corruption."""
        content = "agent_ab did well, agent_a did okay"
        _make_framework_file(tmp_path, "memory/eval.md", content)

        mapping = {"agent_a": "agent1", "agent_ab": "agent2"}
        scrub_agent_ids_in_snapshot(tmp_path, mapping)

        result = (tmp_path / "memory/eval.md").read_text()
        assert "agent2 did well" in result
        assert "agent1 did okay" in result

    def test_empty_mapping_is_noop(self, tmp_path: Path) -> None:
        """Empty mapping returns 0 without error."""
        _make_framework_file(tmp_path, "memory/note.md", "agent_a content")

        count = scrub_agent_ids_in_snapshot(tmp_path, {})

        assert count == 0

    def test_nonexistent_root_returns_zero(self, tmp_path: Path) -> None:
        """Non-existent root path returns 0 without error."""
        count = scrub_agent_ids_in_snapshot(
            tmp_path / "nonexistent",
            {"agent_a": "agent1"},
        )
        assert count == 0


# ---------------------------------------------------------------------------
# Unit tests for copytree exclusion of framework dirs
# ---------------------------------------------------------------------------


class TestCopytreeExcludesFrameworkDirs:
    """Verify copy_snapshots_to_temp_workspace excludes framework metadata dirs."""

    @staticmethod
    def _create_snapshot_with_framework_dirs(snapshot_path: Path) -> None:
        """Create a snapshot dir with deliverables + framework dirs."""
        # Deliverables
        (snapshot_path / "answer.md").write_text("My answer")
        (snapshot_path / "deliverable").mkdir()
        (snapshot_path / "deliverable" / "report.txt").write_text("Report content")
        # tasks/ and memory/ (framework but needed for evaluation)
        (snapshot_path / "tasks").mkdir()
        (snapshot_path / "tasks" / "plan.json").write_text("{}")
        (snapshot_path / "memory").mkdir()
        (snapshot_path / "memory" / "notes.md").write_text("Notes")
        # Framework dirs that should be excluded
        (snapshot_path / ".massgen").mkdir()
        (snapshot_path / ".massgen" / "agent_a_coordination_config.json").write_text("{}")
        (snapshot_path / ".codex").mkdir()
        (snapshot_path / ".codex" / "config.toml").write_text("backend=codex")
        (snapshot_path / ".gemini").mkdir()
        (snapshot_path / ".gemini" / "settings.json").write_text("{}")
        (snapshot_path / ".claude").mkdir()
        (snapshot_path / ".claude" / "settings.json").write_text("{}")
        (snapshot_path / ".git").mkdir()
        (snapshot_path / ".git" / "HEAD").write_text("ref: refs/heads/main")

    @pytest.mark.asyncio
    async def test_copytree_excludes_massgen_dir(self, tmp_path: Path) -> None:
        """`.massgen/` should not appear in the temp workspace copy."""
        from massgen.filesystem_manager._filesystem_manager import FilesystemManager

        snapshot_path = tmp_path / "snapshots" / "agent_a"
        snapshot_path.mkdir(parents=True)
        self._create_snapshot_with_framework_dirs(snapshot_path)

        fm = FilesystemManager(cwd=str(tmp_path / "workspace"))
        fm.agent_temporary_workspace = tmp_path / "temp"
        fm.agent_temporary_workspace.mkdir()

        await fm.copy_snapshots_to_temp_workspace(
            {"agent_a": snapshot_path},
            {"agent_a": "agent1"},
        )

        dest = tmp_path / "temp" / "agent1"
        assert not (dest / ".massgen").exists()

    @pytest.mark.asyncio
    async def test_copytree_excludes_codex_dir(self, tmp_path: Path) -> None:
        """`.codex/` should not appear in the temp workspace copy."""
        from massgen.filesystem_manager._filesystem_manager import FilesystemManager

        snapshot_path = tmp_path / "snapshots" / "agent_a"
        snapshot_path.mkdir(parents=True)
        self._create_snapshot_with_framework_dirs(snapshot_path)

        fm = FilesystemManager(cwd=str(tmp_path / "workspace"))
        fm.agent_temporary_workspace = tmp_path / "temp"
        fm.agent_temporary_workspace.mkdir()

        await fm.copy_snapshots_to_temp_workspace(
            {"agent_a": snapshot_path},
            {"agent_a": "agent1"},
        )

        dest = tmp_path / "temp" / "agent1"
        assert not (dest / ".codex").exists()
        assert not (dest / ".gemini").exists()
        assert not (dest / ".claude").exists()
        assert not (dest / ".git").exists()

    @pytest.mark.asyncio
    async def test_copytree_preserves_deliverables(self, tmp_path: Path) -> None:
        """Deliverable dirs and framework-needed dirs survive the copy."""
        from massgen.filesystem_manager._filesystem_manager import FilesystemManager

        snapshot_path = tmp_path / "snapshots" / "agent_a"
        snapshot_path.mkdir(parents=True)
        self._create_snapshot_with_framework_dirs(snapshot_path)

        fm = FilesystemManager(cwd=str(tmp_path / "workspace"))
        fm.agent_temporary_workspace = tmp_path / "temp"
        fm.agent_temporary_workspace.mkdir()

        await fm.copy_snapshots_to_temp_workspace(
            {"agent_a": snapshot_path},
            {"agent_a": "agent1"},
        )

        dest = tmp_path / "temp" / "agent1"
        assert (dest / "answer.md").exists()
        assert (dest / "deliverable" / "report.txt").exists()
        assert (dest / "tasks" / "plan.json").exists()
        assert (dest / "memory" / "notes.md").exists()
