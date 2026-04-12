/**
 * Hook to poll subagent events from the backend API.
 *
 * Fetches events.jsonl for a subagent (e.g., pre-collab phases) and feeds
 * them into the message store so SubagentTile can render inner agent activity.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useMessageStore } from '../stores/v2/messageStore';

const POLL_INTERVAL_MS = 2500;

interface UseSubagentEventsOptions {
  /** Session ID for the API call */
  sessionId: string;
  /** Subagent ID (e.g., "persona_generation") */
  subagentId: string;
  /** Whether polling is active (set to false to stop) */
  enabled: boolean;
}

export function useSubagentEvents({ sessionId, subagentId, enabled }: UseSubagentEventsOptions) {
  const afterRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(enabled);
  activeRef.current = enabled;

  const poll = useCallback(async () => {
    if (!activeRef.current || !sessionId || !subagentId) return;

    try {
      const resp = await fetch(
        `/api/sessions/${sessionId}/subagent/${subagentId}/events?after=${afterRef.current}`,
      );
      if (!resp.ok) return;

      const data = await resp.json();
      const events = data.events as Array<Record<string, unknown>>;
      const total = (data.total as number) || 0;

      if (events && events.length > 0) {
        // Ensure message arrays exist for any agent IDs in these events
        const messageStore = useMessageStore.getState();
        const agentIds = new Set<string>();
        for (const ev of events) {
          const aid = ev.agent_id as string | null;
          if (aid && !messageStore.messages[aid]) {
            agentIds.add(aid);
          }
        }

        // Initialize message arrays for new inner agents
        if (agentIds.size > 0) {
          const newMessages = { ...messageStore.messages };
          const newOrder = [...messageStore.agentOrder];
          for (const aid of agentIds) {
            if (!newMessages[aid]) {
              newMessages[aid] = [];
            }
            if (!newOrder.includes(aid)) {
              newOrder.push(aid);
            }
          }
          // Also register as threads so they show in the SubagentTile
          const newThreads = [...messageStore.threads];
          for (const aid of agentIds) {
            if (!newThreads.find((t) => t.id === aid)) {
              newThreads.push({
                id: aid,
                parentAgentId: subagentId,
                task: '',
                status: 'running' as const,
                startTime: Date.now() / 1000,
              });
            }
          }
          useMessageStore.setState({
            messages: newMessages,
            agentOrder: newOrder,
            threads: newThreads,
          });
        }

        // Process each event through the message store
        for (const ev of events) {
          useMessageStore.getState().processWSEvent(ev as any);
        }
      }

      if (total > afterRef.current) {
        afterRef.current = total;
      }
    } catch {
      // Silently continue polling on error
    }

    // Schedule next poll
    if (activeRef.current) {
      timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    }
  }, [sessionId, subagentId]);

  useEffect(() => {
    if (enabled) {
      // Reset cursor when (re-)enabling
      afterRef.current = 0;
      poll();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, poll]);
}
