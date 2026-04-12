/**
 * WebSocket Hook for MassGen Real-Time Communication
 *
 * Manages WebSocket connection lifecycle, auto-reconnection,
 * and event processing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAgentStore } from '../stores/agentStore';
import { useMessageStore } from '../stores/v2/messageStore';
import { useModeStore } from '../stores/v2/modeStore';
import { useReviewStore } from '../stores/v2/reviewStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { WSEvent } from '../types';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const WORKSPACE_REFRESH_DEBOUNCE_MS = 250;

interface UseWebSocketOptions {
  sessionId: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

interface UseWebSocketReturn {
  status: ConnectionStatus;
  connect: () => void;
  disconnect: () => void;
  send: (data: Record<string, unknown>) => void;
  startCoordination: (question: string, configPath?: string) => void;
  continueConversation: (question: string) => void;
  cancelCoordination: () => void;
  broadcastMessage: (message: string, targets: string[] | null) => void;
  error: string | null;
}

export function useWebSocket({
  sessionId,
  autoConnect = true,
  reconnectAttempts = 5,
  reconnectInterval = 3000,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processWSEvent = useAgentStore((state) => state.processWSEvent);
  const processV2Event = useMessageStore((state) => state.processWSEvent);
  const refreshWorkspaceSession = useWorkspaceStore((state) => state.refreshSessionFn);

  // Build WebSocket URL
  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws/${sessionId}`;
  }, [sessionId]);

  // Handle incoming messages — dispatch to both v1 and v2 stores
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data: WSEvent = JSON.parse(event.data);
        processWSEvent(data);
        processV2Event(data);

        // Dispatch review events to review store
        if (data.type === 'review_request') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          useReviewStore.getState().openReview(data as any);
        } else if (data.type === 'review_resolved') {
          useReviewStore.getState().closeReview();
        }

        if (data.type === 'file_change' && refreshWorkspaceSession) {
          if (workspaceRefreshTimeoutRef.current) {
            clearTimeout(workspaceRefreshTimeoutRef.current);
          }
          workspaceRefreshTimeoutRef.current = setTimeout(() => {
            refreshWorkspaceSession();
            workspaceRefreshTimeoutRef.current = null;
          }, WORKSPACE_REFRESH_DEBOUNCE_MS);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    },
    [processWSEvent, processV2Event, refreshWorkspaceSession]
  );

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');
    setError(null);

    try {
      const ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        setStatus('connected');
        reconnectCountRef.current = 0;
        console.log('WebSocket connected');
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        setStatus('disconnected');
        console.log('WebSocket disconnected:', event.code, event.reason);

        // Auto-reconnect if not intentionally closed
        if (event.code !== 1000 && reconnectCountRef.current < reconnectAttempts) {
          reconnectCountRef.current++;
          console.log(
            `Reconnecting... Attempt ${reconnectCountRef.current}/${reconnectAttempts}`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setStatus('error');
        setError('WebSocket connection failed');
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [getWsUrl, handleMessage, reconnectAttempts, reconnectInterval]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (workspaceRefreshTimeoutRef.current) {
      clearTimeout(workspaceRefreshTimeoutRef.current);
      workspaceRefreshTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    setStatus('disconnected');
  }, []);

  // Send message via WebSocket
  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not connected');
    }
  }, []);

  // Register send function with review store so modal can send responses
  useEffect(() => {
    useReviewStore.getState().setSendFn(send);
  }, [send]);

  // Start coordination
  const startCoordination = useCallback(
    (question: string, configPath?: string) => {
      const overrides = useModeStore.getState().getOverrides();
      send({
        action: 'start',
        question,
        config: configPath,
        mode_overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
      });
    },
    [send]
  );

  // Continue conversation with follow-up question
  const continueConversation = useCallback(
    (question: string) => {
      const overrides = useModeStore.getState().getOverrides();
      send({
        action: 'continue',
        question,
        mode_overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
      });
    },
    [send]
  );

  // Cancel coordination
  const cancelCoordination = useCallback(() => {
    send({
      action: 'cancel',
    });
  }, [send]);

  // Broadcast message to agents during active session
  const broadcastMessage = useCallback(
    (message: string, targets: string[] | null) => {
      send({
        action: 'broadcast_response',
        message,
        targets,
      });
    },
    [send]
  );

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && sessionId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, sessionId, connect, disconnect]);

  return {
    status,
    connect,
    disconnect,
    send,
    startCoordination,
    continueConversation,
    cancelCoordination,
    broadcastMessage,
    error,
  };
}

export default useWebSocket;
