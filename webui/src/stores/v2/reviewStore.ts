import { create } from 'zustand';
import type { ReviewChangeContext } from '../../types';

/** Parsed per-file entry with individual diff text. */
export interface ParsedFileEntry {
  /** Unique key: "context_path::file_path" or just "file_path" */
  key: string;
  path: string;
  status: 'M' | 'A' | 'D';
  diff: string;
  contextPath?: string;
}

interface ReviewState {
  isOpen: boolean;
  changes: ReviewChangeContext[];
  answerContent: string;
  voteResults: Record<string, unknown>;
  agentId: string;
  modelName: string;
  contextPaths: Record<string, string[]> | null;
  /** Per-file parsed entries with individual diffs */
  parsedFiles: ParsedFileEntry[];
  /** File approval state: key -> approved */
  fileApprovals: Record<string, boolean>;
  /** Currently selected file key for diff viewing */
  selectedFile: string | null;
}

interface ReviewActions {
  openReview: (data: {
    changes: ReviewChangeContext[];
    answer_content: string;
    vote_results: Record<string, unknown>;
    agent_id: string;
    model_name: string;
    context_paths?: Record<string, string[]>;
  }) => void;
  closeReview: () => void;
  toggleFile: (fileKey: string) => void;
  toggleAllFiles: (approved: boolean) => void;
  setSelectedFile: (fileKey: string) => void;
  /** Set the WebSocket send function reference (called once at mount) */
  setSendFn: (fn: (data: Record<string, unknown>) => void) => void;
  submitDecision: (action: 'approve' | 'reject') => void;
}

/**
 * Parse unified diff text into per-file diffs.
 *
 * Splits a multi-file unified diff (git diff output) into individual
 * file sections keyed by file path.
 */
function parsePerFileDiffs(diff: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = diff.split('\n');
  let currentFile: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    // Match "diff --git a/path b/path" or "+++ b/path"
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)/);
    if (diffMatch) {
      // Save previous file
      if (currentFile) {
        result[currentFile] = currentLines.join('\n');
      }
      currentFile = diffMatch[2];
      currentLines = [line];
      continue;
    }

    if (currentFile) {
      currentLines.push(line);
    }
  }

  // Save last file
  if (currentFile) {
    result[currentFile] = currentLines.join('\n');
  }

  return result;
}

export const useReviewStore = create<ReviewState & ReviewActions>(
  (set, get) => ({
    // Internal: WebSocket send function (set via setSendFn)
    _sendFn: null as ((data: Record<string, unknown>) => void) | null,

    // State
    isOpen: false,
    changes: [],
    answerContent: '',
    voteResults: {},
    agentId: '',
    modelName: '',
    contextPaths: null,
    parsedFiles: [],
    fileApprovals: {},
    selectedFile: null,

    openReview: (data) => {
      const parsedFiles: ParsedFileEntry[] = [];
      const fileApprovals: Record<string, boolean> = {};

      for (const ctx of data.changes) {
        const perFileDiffs = parsePerFileDiffs(ctx.diff || '');
        const contextPath = ctx.original_path || '';

        for (const change of ctx.changes) {
          const key = contextPath
            ? `${contextPath}::${change.path}`
            : change.path;

          parsedFiles.push({
            key,
            path: change.path,
            status: change.status,
            diff: perFileDiffs[change.path] || '',
            contextPath: contextPath || undefined,
          });

          // All files approved by default
          fileApprovals[key] = true;
        }
      }

      set({
        isOpen: true,
        changes: data.changes,
        answerContent: data.answer_content,
        voteResults: data.vote_results,
        agentId: data.agent_id,
        modelName: data.model_name,
        contextPaths: data.context_paths || null,
        parsedFiles,
        fileApprovals,
        selectedFile: parsedFiles.length > 0 ? parsedFiles[0].key : null,
      });
    },

    closeReview: () => {
      set({
        isOpen: false,
        changes: [],
        answerContent: '',
        voteResults: {},
        agentId: '',
        modelName: '',
        contextPaths: null,
        parsedFiles: [],
        fileApprovals: {},
        selectedFile: null,
      });
    },

    toggleFile: (fileKey) => {
      const approvals = { ...get().fileApprovals };
      approvals[fileKey] = !approvals[fileKey];
      set({ fileApprovals: approvals });
    },

    toggleAllFiles: (approved) => {
      const approvals: Record<string, boolean> = {};
      for (const file of get().parsedFiles) {
        approvals[file.key] = approved;
      }
      set({ fileApprovals: approvals });
    },

    setSelectedFile: (fileKey) => {
      set({ selectedFile: fileKey });
    },

    setSendFn: (fn) => {
      // Store the send function reference (not in visible state)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (get() as any)._sendFn = fn;
    },

    submitDecision: (action) => {
      const state = get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sendFn = (state as any)._sendFn as ((data: Record<string, unknown>) => void) | null;
      if (!sendFn) {
        console.error('ReviewStore: no WebSocket send function set');
        return;
      }

      if (action === 'reject') {
        sendFn({
          action: 'review_response',
          approved: false,
          action_type: 'reject',
        });
      } else {
        // Collect approved files
        const approvedFiles = state.parsedFiles
          .filter((f) => state.fileApprovals[f.key])
          .map((f) => f.path);

        sendFn({
          action: 'review_response',
          approved: true,
          approved_files: approvedFiles,
          action_type: 'approve',
          metadata: {
            selection_mode:
              approvedFiles.length === state.parsedFiles.length
                ? 'all'
                : 'selected',
          },
        });
      }

      // Close the modal after submitting
      get().closeReview();
    },
  })
);
