"""Tests for workspace relocation under .massgen/workspaces/ and post-run cleanup.

Verifies:
- Relative cwd paths (like 'workspace') get routed under .massgen/workspaces/
- Absolute cwd paths are left untouched
- FilesystemManager.cleanup() removes workspace dirs under .massgen/workspaces/
- Stale workspaces from previous runs are pruned on startup
"""

from pathlib import Path

from massgen.cli import _route_workspace_path


class TestWorkspaceRelocation:
    """Relative workspace paths should be routed under .massgen/workspaces/."""

    def test_relative_cwd_routed_under_massgen_workspaces(self):
        """cwd: 'workspace' -> '.massgen/workspaces/workspace'."""
        result = _route_workspace_path("workspace")
        assert result == ".massgen/workspaces/workspace"

    def test_nested_relative_cwd_routed(self):
        """cwd: 'my/workspace' -> '.massgen/workspaces/my/workspace'."""
        result = _route_workspace_path("my/workspace")
        assert result == ".massgen/workspaces/my/workspace"

    def test_absolute_cwd_not_modified(self, tmp_path):
        """Absolute cwd paths should not be rerouted under .massgen/."""
        abs_path = str(tmp_path / "my_custom_workspace")
        result = _route_workspace_path(abs_path)
        assert result == abs_path

    def test_already_under_massgen_not_double_prefixed(self):
        """cwd already under .massgen/workspaces/ should not be double-prefixed."""
        result = _route_workspace_path(".massgen/workspaces/workspace")
        assert result == ".massgen/workspaces/workspace"
        assert ".massgen/workspaces/.massgen" not in result


class TestWorkspaceCleanup:
    """FilesystemManager.cleanup() should remove workspace dirs under .massgen/workspaces/."""

    def _make_fm(self, workspace: Path):
        """Create a minimal FilesystemManager instance for cleanup testing."""
        from massgen.filesystem_manager._filesystem_manager import FilesystemManager

        fm = FilesystemManager.__new__(FilesystemManager)
        fm.cwd = workspace
        fm.agent_temporary_workspace = None
        fm.agent_temporary_workspace_parent = None
        fm.isolation_manager = None
        fm.docker_manager = None
        fm.shared_tools_directory = None
        fm.local_skills_directory = None
        fm.agent_id = None
        return fm

    def test_cleanup_removes_massgen_workspace(self, tmp_path):
        """cleanup() deletes the workspace if it's under .massgen/workspaces/."""
        workspace = tmp_path / ".massgen" / "workspaces" / "workspace_abc12345"
        workspace.mkdir(parents=True)
        (workspace / "test_file.txt").write_text("content")

        fm = self._make_fm(workspace)
        fm.cleanup()

        assert not workspace.exists(), "Workspace under .massgen/workspaces/ should be cleaned up"

    def test_cleanup_does_not_remove_external_workspace(self, tmp_path):
        """cleanup() must NOT delete workspaces outside .massgen/workspaces/."""
        workspace = tmp_path / "my_custom_workspace"
        workspace.mkdir(parents=True)
        (workspace / "test_file.txt").write_text("content")

        fm = self._make_fm(workspace)
        fm.cleanup()

        assert workspace.exists(), "External workspace should NOT be cleaned up"

    def test_cleanup_prunes_empty_workspaces_parent(self, tmp_path):
        """After removing last workspace, .massgen/workspaces/ dir is also removed."""
        workspaces_dir = tmp_path / ".massgen" / "workspaces"
        workspace = workspaces_dir / "workspace_abc12345"
        workspace.mkdir(parents=True)

        fm = self._make_fm(workspace)
        fm.cleanup()

        assert not workspaces_dir.exists(), "Empty .massgen/workspaces/ should be pruned"

    def test_cleanup_preserves_workspaces_parent_with_siblings(self, tmp_path):
        """Don't prune .massgen/workspaces/ if other workspace dirs still exist."""
        workspaces_dir = tmp_path / ".massgen" / "workspaces"
        workspace_a = workspaces_dir / "workspace_aaaa1111"
        workspace_b = workspaces_dir / "workspace_bbbb2222"
        workspace_a.mkdir(parents=True)
        workspace_b.mkdir(parents=True)

        fm = self._make_fm(workspace_a)
        fm.cleanup()

        assert not workspace_a.exists()
        assert workspace_b.exists()
        assert workspaces_dir.exists(), ".massgen/workspaces/ should remain when siblings exist"


class TestStaleWorkspacePruning:
    """Stale workspaces from previous runs should be pruned on startup."""

    def test_clear_temp_workspace_also_prunes_stale_workspaces(self, tmp_path):
        """clear_temp_workspace() should also clean .massgen/workspaces/."""
        from massgen.filesystem_manager._filesystem_manager import FilesystemManager

        # Create stale workspaces
        workspaces_dir = tmp_path / ".massgen" / "workspaces"
        stale1 = workspaces_dir / "workspace_old11111"
        stale2 = workspaces_dir / "workspace_old22222"
        stale1.mkdir(parents=True)
        stale2.mkdir(parents=True)
        (stale1 / "leftover.txt").write_text("stale")

        # Create temp workspace parent
        temp_parent = tmp_path / ".massgen" / "temp_workspaces"
        temp_parent.mkdir(parents=True)

        fm = FilesystemManager.__new__(FilesystemManager)
        fm.agent_temporary_workspace_parent = temp_parent
        fm.cwd = tmp_path / ".massgen" / "workspaces" / "workspace_current"

        fm.clear_temp_workspace()

        assert not stale1.exists(), "Stale workspace should be pruned"
        assert not stale2.exists(), "Stale workspace should be pruned"
