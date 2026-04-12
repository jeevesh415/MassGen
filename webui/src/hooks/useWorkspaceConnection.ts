/**
 * Always-On Workspace WebSocket Connection
 *
 * Manages WebSocket connection for workspace file listing.
 * - Connects automatically when session exists
 * - Pre-fetches file lists on connect (instant modal open)
 * - Supports on-demand refresh via refreshSession()
 * - No live file watching (simplified for reliability)
 *
 * @see specs/001-fix-workspace-browser/spec.md
 */

import { useCallback, useEffect, useRef } from 'react';
import { useAgentStore } from '../stores/agentStore';
import {
  useWorkspaceStore,
  type WorkspaceFileInfo,
} from '../stores/workspaceStore';
import type { WorkspaceWSEvent } from '../types';

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_INTERVAL = 1000; // ms
const WORKSPACE_POLL_INTERVAL = 5000; // ms — re-poll watch_session until data arrives
const COMPLETION_EMPTY_POLL_GRACE_ATTEMPTS = 3;

/**
 * Always-on workspace WebSocket connection hook.
 * Mount this once near the app root - it will automatically
 * connect when a session exists and keep workspace files up-to-date.
 */
export function useWorkspaceConnection() {
  // Get session ID from agent store
  const sessionId = useAgentStore((s) => s.sessionId);
  const isComplete = useAgentStore((s) => s.isComplete);
  const agentCount = useAgentStore((s) => s.agentOrder.length);
  const answerCount = useAgentStore((s) => s.answers.length);
  const fileChangeCount = useAgentStore((s) =>
    Object.values(s.agents).reduce((total, agent) => total + agent.files.length, 0)
  );

  // Workspace store actions
  const setConnectionStatus = useWorkspaceStore((s) => s.setConnectionStatus);
  const setConnectionError = useWorkspaceStore((s) => s.setConnectionError);
  const incrementReconnectAttempts = useWorkspaceStore(
    (s) => s.incrementReconnectAttempts
  );
  const resetReconnectAttempts = useWorkspaceStore(
    (s) => s.resetReconnectAttempts
  );
  const setInitialFiles = useWorkspaceStore((s) => s.setInitialFiles);
  const resetWorkspaceStore = useWorkspaceStore((s) => s.reset);
  const setRefreshSessionFn = useWorkspaceStore((s) => s.setRefreshSessionFn);

  // Refs for WebSocket management
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const intentionalDisconnectRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  const reconnectAttemptsRef = useRef(0);
  const completionEmptyPollsRef = useRef(0);
  const liveRefreshSignatureRef = useRef({
    sessionId: '',
    answerCount: 0,
    fileChangeCount: 0,
    isComplete: false,
  });

  // Keep sessionId ref updated
  useEffect(() => {
    sessionIdRef.current = sessionId;
    completionEmptyPollsRef.current = 0;
  }, [sessionId]);

  // Build WebSocket URL
  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws/workspace/${sessionIdRef.current}`;
  }, []);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data: WorkspaceWSEvent = JSON.parse(event.data);

        switch (data.type) {
          case 'workspace_connected':
            // Store initial files for each workspace
            if (data.initial_files) {
              for (const [wsPath, files] of Object.entries(data.initial_files)) {
                const fileList = files as WorkspaceFileInfo[];
                const agentId = data.workspace_metadata?.[wsPath]?.agent_id;
                setInitialFiles(wsPath, fileList, agentId);
              }
            }
            break;

          case 'workspace_refresh':
            // Full refresh - replace all files for this workspace
            if (data.workspace_path && data.files) {
              setInitialFiles(data.workspace_path, data.files, data.agent_id);
            }
            break;

          case 'workspace_error':
            console.error('[WS:Workspace] Error:', data.error);
            setConnectionError(data.error);
            break;

          default:
            // Silently ignore unknown events
            break;
        }
      } catch (err) {
        console.error('[WS:Workspace] Failed to parse message:', err);
      }
    },
    [setInitialFiles, setConnectionError]
  );

  // Schedule reconnect with exponential backoff
  const scheduleReconnect = useCallback(() => {
    if (intentionalDisconnectRef.current) {
      return;
    }

    reconnectAttemptsRef.current += 1;
    incrementReconnectAttempts();

    if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
      setConnectionStatus('disconnected');
      setConnectionError(
        `Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`
      );
      return;
    }

    setConnectionStatus('reconnecting');

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay =
      RECONNECT_BASE_INTERVAL *
      Math.pow(2, reconnectAttemptsRef.current - 1);
    console.log(
      `Workspace WebSocket reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
    );

    reconnectTimeoutRef.current = setTimeout(() => {
      wsRef.current = null;
      connect();
    }, delay);
  }, [incrementReconnectAttempts, setConnectionStatus, setConnectionError]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) {
      return;
    }

    intentionalDisconnectRef.current = false;
    setConnectionStatus('connecting');
    setConnectionError(null);

    try {
      const ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        resetReconnectAttempts();
        setConnectionError(null);

        // Request to watch all workspaces for this session
        // Backend will determine which workspaces to watch based on session
        ws.send(
          JSON.stringify({
            action: 'watch_session',
          })
        );
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {

        if (!intentionalDisconnectRef.current && event.code !== 1000) {
          scheduleReconnect();
        } else {
          setConnectionStatus('disconnected');
        }
      };

      ws.onerror = (event) => {
        console.error('Workspace WebSocket error:', event);
        setConnectionError('WebSocket connection failed');
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to create workspace WebSocket:', err);
      setConnectionStatus('disconnected');
      setConnectionError(
        err instanceof Error ? err.message : 'Failed to connect'
      );
    }
  }, [
    getWsUrl,
    handleMessage,
    scheduleReconnect,
    setConnectionStatus,
    setConnectionError,
    resetReconnectAttempts,
  ]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    setConnectionStatus('disconnected');
    reconnectAttemptsRef.current = 0;
    resetReconnectAttempts();
  }, [setConnectionStatus, resetReconnectAttempts]);

  // Auto-connect when session exists, disconnect when it doesn't
  useEffect(() => {
    if (sessionId) {
      connect();
    } else {
      disconnect();
      resetWorkspaceStore();
    }

    return () => {
      disconnect();
    };
  }, [sessionId, connect, disconnect, resetWorkspaceStore]);

  // Request refresh for a specific workspace (exposed for manual refresh)
  const requestRefresh = useCallback((workspacePath: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: 'refresh',
          path: workspacePath,
        })
      );
    }
  }, []);

  // Re-fetch all workspace files for the session by re-sending watch_session
  // This re-reads status.json and sends fresh initial_files for all workspaces
  // Use this when workspace paths may have changed since initial connection
  const refreshSession = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: 'watch_session',
        })
      );
    }
  }, []);

  // Register refreshSession in the store so other components can call it
  useEffect(() => {
    setRefreshSessionFn(refreshSession);
    return () => setRefreshSessionFn(null);
  }, [refreshSession, setRefreshSessionFn]);

  useEffect(() => {
    const previous = liveRefreshSignatureRef.current;
    const sessionChanged = previous.sessionId !== sessionId;
    const answerAdvanced = !sessionChanged && answerCount > previous.answerCount;
    const fileChanged = !sessionChanged && fileChangeCount > previous.fileChangeCount;
    const completedNow = !sessionChanged && isComplete && !previous.isComplete;

    liveRefreshSignatureRef.current = {
      sessionId: sessionId || '',
      answerCount,
      fileChangeCount,
      isComplete,
    };

    if (!sessionId || !(answerAdvanced || fileChanged || completedNow)) {
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'watch_session' }));
    }
  }, [answerCount, fileChangeCount, isComplete, sessionId]);

  // Auto-poll: re-send watch_session while workspaces are still missing
  // or discovered workspaces are still empty. This covers the race where
  // status.json exposes the workspace path before the agent has written
  // any visible files, which would otherwise leave the UI stuck on an
  // empty snapshot for the rest of the run.
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspaceEntries = Object.values(workspaces);
  const hasNoWorkspaces = workspaceEntries.length === 0;
  const missingAgentWorkspaces =
    agentCount > 0 && workspaceEntries.length < agentCount;
  const hasEmptyWorkspace = workspaceEntries.some(
    (workspace) => workspace.files.length === 0
  );
  const shouldPollForWorkspaceFiles =
    (hasNoWorkspaces || missingAgentWorkspaces || hasEmptyWorkspace);

  useEffect(() => {
    if (!shouldPollForWorkspaceFiles) {
      completionEmptyPollsRef.current = 0;
    }
  }, [shouldPollForWorkspaceFiles]);

  useEffect(() => {
    if (!shouldPollForWorkspaceFiles || !sessionId) return;

    const id = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        if (
          isComplete &&
          completionEmptyPollsRef.current >=
            COMPLETION_EMPTY_POLL_GRACE_ATTEMPTS
        ) {
          return;
        }
        wsRef.current.send(JSON.stringify({ action: 'watch_session' }));
        if (isComplete) {
          completionEmptyPollsRef.current += 1;
        }
      }
    }, WORKSPACE_POLL_INTERVAL);

    return () => clearInterval(id);
  }, [sessionId, shouldPollForWorkspaceFiles, isComplete]);

  return {
    connect,
    disconnect,
    requestRefresh,
    refreshSession,
  };
}

export default useWorkspaceConnection;
