"""Filesystem management utilities for MassGen backend."""

from ._base import Permission
from ._change_applier import ChangeApplier, ReviewResult
from ._file_operation_tracker import FileOperationTracker
from ._filesystem_manager import (
    FilesystemManager,
    git_commit_if_changed,
    has_meaningful_content,
)
from ._isolation_context_manager import IsolationContextManager
from ._path_permission_manager import (
    ManagedPath,
    PathPermissionManager,
    PathPermissionManagerHook,
)
from ._path_rewriter import (
    replace_stale_paths_in_workspace,
    scrub_agent_ids_in_snapshot,
)
from ._workspace_tools_server import get_copy_file_pairs

__all__ = [
    "ChangeApplier",
    "FileOperationTracker",
    "FilesystemManager",
    "IsolationContextManager",
    "ManagedPath",
    "PathPermissionManager",
    "PathPermissionManagerHook",
    "Permission",
    "ReviewResult",
    "get_copy_file_pairs",
    "git_commit_if_changed",
    "has_meaningful_content",
    "replace_stale_paths_in_workspace",
    "scrub_agent_ids_in_snapshot",
]
