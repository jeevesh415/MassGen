/**
 * Zustand Store for Workspace State Management
 *
 * Manages workspace file lists with pre-fetched cached data.
 * Files are loaded on WebSocket connect and refreshed on-demand.
 * No live file monitoring - uses simple pre-fetch + cache pattern.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { normalizePath } from '../utils/normalizePath';
import { clearFileNotFoundForWorkspace } from '../hooks/useFileContent';
import { debugLog } from '../utils/debugLogger';

// File info from WebSocket/API
export interface WorkspaceFileInfo {
  path: string;
  size: number;
  modified: number;
}

// Per-agent workspace state
interface AgentWorkspace {
  workspacePath: string;
  files: WorkspaceFileInfo[];
  lastUpdated: number;
  agentId?: string;
}

// Historical snapshot (from answer)
interface HistoricalSnapshot {
  workspacePath: string;
  files: WorkspaceFileInfo[] | null; // null = not fetched yet
  timestamp: number;
}

export type WorkspaceConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

interface WorkspaceStore {
  // Connection state
  wsStatus: WorkspaceConnectionStatus;
  wsError: string | null;
  reconnectAttempts: number;

  // Per-agent live workspaces (keyed by workspace path)
  workspaces: Record<string, AgentWorkspace>;

  // Historical answer snapshots (keyed by answer label like "agent1.2")
  historicalSnapshots: Record<string, HistoricalSnapshot>;

  // Function to refresh session workspaces (set by useWorkspaceConnection)
  refreshSessionFn: (() => void) | null;

  // Actions - Connection
  setConnectionStatus: (status: WorkspaceConnectionStatus) => void;
  setConnectionError: (error: string | null) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
  setRefreshSessionFn: (fn: (() => void) | null) => void;

  // Actions - Workspace updates
  setInitialFiles: (
    workspacePath: string,
    files: WorkspaceFileInfo[],
    agentId?: string
  ) => void;
  clearWorkspace: (workspacePath: string) => void;

  // Actions - Historical snapshots
  addHistoricalSnapshot: (
    answerLabel: string,
    workspacePath: string,
    timestamp?: number,
    files?: WorkspaceFileInfo[]
  ) => void;
  setSnapshotFiles: (answerLabel: string, files: WorkspaceFileInfo[]) => void;

  // Actions - Selectors/Getters
  getWorkspaceFiles: (workspacePath: string) => WorkspaceFileInfo[];
  getHistoricalFiles: (answerLabel: string) => WorkspaceFileInfo[] | null;

  // Reset
  reset: () => void;
}

const initialState = {
  wsStatus: 'disconnected' as WorkspaceConnectionStatus,
  wsError: null,
  reconnectAttempts: 0,
  workspaces: {},
  historicalSnapshots: {},
  refreshSessionFn: null as (() => void) | null,
};

export const useWorkspaceStore = create<WorkspaceStore>()(
  devtools(
    (set, get) => ({
  ...initialState,

  // Connection actions
  setConnectionStatus: (status) => set({ wsStatus: status }),

  setConnectionError: (error) => set({ wsError: error }),

  incrementReconnectAttempts: () =>
    set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 })),

  resetReconnectAttempts: () => set({ reconnectAttempts: 0 }),

  setRefreshSessionFn: (fn) => set({ refreshSessionFn: fn }),

  // Workspace update actions
  setInitialFiles: (workspacePath, files, agentId) => {
    // Normalize path to ensure consistent key format across HTTP and WebSocket
    const normalizedPath = normalizePath(workspacePath);
    // FIX: Clear stale 404 caches when receiving fresh file list
    // This ensures files that previously returned 404 can be fetched again
    clearFileNotFoundForWorkspace(normalizedPath);
    set((state) => ({
      workspaces: {
        ...state.workspaces,
        [normalizedPath]: {
          workspacePath: normalizedPath,
          files,
          lastUpdated: Date.now(),
          agentId: agentId ?? state.workspaces[normalizedPath]?.agentId,
        },
      },
    }));
  },

  clearWorkspace: (workspacePath) => {
    const normalizedPath = normalizePath(workspacePath);
    set((state) => {
      const { [normalizedPath]: _, ...rest } = state.workspaces;
      return { workspaces: rest };
    });
  },

  // Historical snapshot actions
  addHistoricalSnapshot: (answerLabel, workspacePath, timestamp, files) => {
    // Normalize path for consistent lookup
    const normalizedPath = normalizePath(workspacePath);

    set((state) => ({
      historicalSnapshots: {
        ...state.historicalSnapshots,
        [answerLabel]: {
          workspacePath: normalizedPath,
          files: files ?? null,
          timestamp: timestamp || Date.now(),
        },
      },
    }));
  },

  setSnapshotFiles: (answerLabel, files) =>
    set((state) => {
      const snapshot = state.historicalSnapshots[answerLabel];
      if (!snapshot) return state;

      return {
        historicalSnapshots: {
          ...state.historicalSnapshots,
          [answerLabel]: {
            ...snapshot,
            files,
          },
        },
      };
    }),

  // Getters
  getWorkspaceFiles: (workspacePath) => {
    // Normalize path to ensure lookup matches stored keys
    const normalizedPath = normalizePath(workspacePath);
    const state = get();
    const workspace = state.workspaces[normalizedPath];
    return workspace?.files || [];
  },

  getHistoricalFiles: (answerLabel) => {
    const snapshot = get().historicalSnapshots[answerLabel];
    // Return null only when the snapshot has not been fetched yet.
    // An empty array means the snapshot was fetched successfully but has no visible files.
    if (!snapshot || snapshot.files === null) {
      debugLog.info('[HistoricalLoad] getHistoricalFiles returning null', {
        answerLabel,
        hasSnapshot: !!snapshot,
        filesNull: snapshot?.files === null,
        filesLength: snapshot?.files?.length ?? 'N/A',
      });
      return null;
    }
    debugLog.info('[HistoricalLoad] getHistoricalFiles returning files', {
      answerLabel,
      fileCount: snapshot.files.length,
    });
    return snapshot.files;
  },

  // Reset
  reset: () => set(initialState),
    }),
    { name: 'WorkspaceStore' }
  )
);

// Selectors for common queries
export const selectWsStatus = (state: WorkspaceStore) => state.wsStatus;
export const selectWsError = (state: WorkspaceStore) => state.wsError;
export const selectWorkspaces = (state: WorkspaceStore) => state.workspaces;
export const selectHistoricalSnapshots = (state: WorkspaceStore) =>
  state.historicalSnapshots;

// Get files for a specific workspace path (normalizes path for consistent lookup)
export const selectFilesForWorkspace =
  (workspacePath: string) => (state: WorkspaceStore) =>
    state.workspaces[normalizePath(workspacePath)]?.files || [];

// Get files for a historical snapshot
export const selectFilesForSnapshot =
  (answerLabel: string) => (state: WorkspaceStore) =>
    state.historicalSnapshots[answerLabel]?.files || null;

// Check if a workspace has files loaded (normalizes path for consistent lookup)
export const selectHasFilesLoaded =
  (workspacePath: string) => (state: WorkspaceStore) =>
    !!state.workspaces[normalizePath(workspacePath)]?.files?.length;
