/**
 * v2 Status Store
 *
 * Polls the /api/sessions/{sessionId}/status endpoint to surface
 * cost, timing, and context path data in the WebUI top bar.
 */

import { create } from 'zustand';

export interface AgentRoundTiming {
  agentId: string;
  roundNumber: number;
  roundStartTime: number;
  status: string;
}

export interface EvalCriterion {
  id: string;
  text: string;
  category: string;  // "primary", "standard", "stretch" (legacy: "must", "should", "could")
}

export interface ContextPath {
  path: string;
  permission: string;  // "read", "write"
}

interface StatusStoreState {
  /** Total elapsed seconds for the session */
  elapsedSeconds: number;
  /** Total estimated cost in USD */
  totalCost: number;
  /** Total LLM input tokens */
  totalInputTokens: number;
  /** Total LLM output tokens */
  totalOutputTokens: number;
  /** Orchestrator config/log paths */
  orchestratorPaths: Record<string, string>;
  /** Generated evaluation criteria */
  evalCriteria: EvalCriterion[];
  /** User-provided context paths */
  contextPaths: ContextPath[];
  /** Whether Docker execution mode is enabled */
  dockerEnabled: boolean;
  /** Current coordination phase */
  phase: string;
  /** Completion percentage (0-100) */
  completionPercentage: number;
  /** Whether polling is active */
  isPolling: boolean;
  /** Timestamp of last successful fetch (for local elapsed interpolation) */
  lastFetchTime: number;
  /** The elapsed value at lastFetchTime (for interpolation) */
  elapsedAtLastFetch: number;
  /** Per-agent round timing */
  agentTimings: AgentRoundTiming[];
}

interface StatusStoreActions {
  startPolling: (sessionId: string) => void;
  stopPolling: () => void;
  fetchOnce: (sessionId: string) => Promise<void>;
  reset: () => void;
}

const initialState: StatusStoreState = {
  elapsedSeconds: 0,
  totalCost: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  orchestratorPaths: {},
  evalCriteria: [],
  contextPaths: [],
  dockerEnabled: false,
  phase: '',
  completionPercentage: 0,
  isPolling: false,
  lastFetchTime: 0,
  elapsedAtLastFetch: 0,
  agentTimings: [],
};

let pollInterval: ReturnType<typeof setInterval> | null = null;

export const useStatusStore = create<StatusStoreState & StatusStoreActions>(
  (set, get) => ({
    ...initialState,

    fetchOnce: async (sessionId: string) => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        const status = data?.status;
        if (!status) return;

        const meta = status.meta || {};
        const costs = status.costs || {};
        const coordination = status.coordination || {};
        const agents = status.agents || {};

        // Extract per-agent round timing
        const timings: AgentRoundTiming[] = [];
        for (const [agentId, agentData] of Object.entries(agents)) {
          const ad = agentData as Record<string, unknown>;
          const rt = ad.round_timing as Record<string, unknown> | undefined;
          if (rt) {
            timings.push({
              agentId,
              roundNumber: (rt.round_number as number) || 0,
              roundStartTime: (rt.round_start_time as number) || 0,
              status: (ad.status as string) || '',
            });
          }
        }

        set({
          elapsedSeconds: meta.elapsed_seconds || 0,
          totalCost: costs.total_estimated_cost || 0,
          totalInputTokens: costs.total_input_tokens || 0,
          totalOutputTokens: costs.total_output_tokens || 0,
          orchestratorPaths: meta.orchestrator_paths || {},
          evalCriteria: (meta.eval_criteria as EvalCriterion[]) || [],
          contextPaths: (meta.context_paths as ContextPath[]) || [],
          dockerEnabled: !!meta.docker_enabled,
          phase: coordination.phase || '',
          completionPercentage: coordination.completion_percentage || 0,
          lastFetchTime: Date.now(),
          elapsedAtLastFetch: meta.elapsed_seconds || 0,
          agentTimings: timings,
        });
      } catch {
        // Silently ignore fetch errors (status.json may not exist yet)
      }
    },

    startPolling: (sessionId: string) => {
      const state = get();
      if (state.isPolling) return;

      set({ isPolling: true });

      // Initial fetch
      get().fetchOnce(sessionId);

      // Poll every 3 seconds
      pollInterval = setInterval(() => {
        get().fetchOnce(sessionId);
      }, 3000);
    },

    stopPolling: () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      set({ isPolling: false });
    },

    reset: () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      set(initialState);
    },
  })
);
