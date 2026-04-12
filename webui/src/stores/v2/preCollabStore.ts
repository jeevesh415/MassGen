/**
 * v2 Pre-Collab Store
 *
 * Tracks pre-collaboration phase lifecycle and results.
 * Pre-collab phases (persona generation, eval criteria, prompt improvement)
 * are modeled as thread groups — each is a full MassGen sub-run with inner
 * agents visible via the subagent events endpoint.
 */

import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export type PreCollabPhaseStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface PreCollabPhase {
  id: string;
  label: string;
  status: PreCollabPhaseStatus;
  task: string;
  timeoutSeconds: number;
  startedAt: number | null;
  completedAt: number | null;
  answerPreview: string | null;
  error: string | null;
  logPath: string | null;
  callId: string | null;
  /** Anchor agent ID in the parent orchestration */
  anchorAgentId: string | null;
}

export interface PreCollabPersona {
  agentId: string;
  summary: string;
}

export interface PreCollabCriterion {
  id: string;
  text: string;
  category: string;
}

export interface PreCollabResults {
  personas: PreCollabPersona[];
  evalCriteria: PreCollabCriterion[];
  improvedPrompt: string | null;
}

// ============================================================================
// Labels
// ============================================================================

const PHASE_LABELS: Record<string, string> = {
  persona_generation: 'Personas',
  criteria_generation: 'Eval Criteria',
  prompt_improvement: 'Prompt',
};

function labelFor(id: string): string {
  return PHASE_LABELS[id] || id.replace(/_/g, ' ');
}

// ============================================================================
// Store
// ============================================================================

interface PreCollabStoreState {
  /** True from batch_announced until all phases resolve */
  isActive: boolean;
  /** Phase IDs announced by the backend */
  expectedPhaseIds: string[];
  /** Per-phase state */
  phases: Record<string, PreCollabPhase>;
  /** Persisted results (survive after pre-collab ends) */
  results: PreCollabResults;
  /** Which results tab is selected in the panel */
  activeResultsTab: string | null;
  /** Whether the results panel is open */
  resultsPanelOpen: boolean;
}

interface PreCollabStoreActions {
  /** Process a structured event from the WebSocket */
  processStructuredEvent: (se: {
    event_type: string;
    agent_id: string | null;
    data: Record<string, unknown>;
    timestamp: number;
  }) => void;
  /** Open the results panel to a specific tab */
  openResultsPanel: (tab?: string) => void;
  /** Close the results panel */
  closeResultsPanel: () => void;
  /** Check if any results exist */
  hasResults: () => boolean;
  /** Reset store */
  reset: () => void;
}

const initialResults: PreCollabResults = {
  personas: [],
  evalCriteria: [],
  improvedPrompt: null,
};

const initialState: PreCollabStoreState = {
  isActive: false,
  expectedPhaseIds: [],
  phases: {},
  results: { ...initialResults },
  activeResultsTab: null,
  resultsPanelOpen: false,
};

export const usePreCollabStore = create<PreCollabStoreState & PreCollabStoreActions>(
  (set, get) => ({
    ...initialState,

    processStructuredEvent: (se) => {
      const state = get();

      switch (se.event_type) {
        case 'pre_collab_batch_announced': {
          const ids = (se.data.pre_collab_ids as string[]) || [];
          const phases: Record<string, PreCollabPhase> = {};
          for (const id of ids) {
            phases[id] = {
              id,
              label: labelFor(id),
              status: 'pending',
              task: '',
              timeoutSeconds: 0,
              startedAt: null,
              completedAt: null,
              answerPreview: null,
              error: null,
              logPath: null,
              callId: null,
              anchorAgentId: null,
            };
          }
          set({
            isActive: true,
            expectedPhaseIds: ids,
            phases,
          });
          break;
        }

        case 'pre_collab_started': {
          const subagentId = (se.data.subagent_id as string) || '';
          if (!subagentId) break;

          const existing = state.phases[subagentId];
          const phase: PreCollabPhase = {
            id: subagentId,
            label: existing?.label || labelFor(subagentId),
            status: 'running',
            task: (se.data.task as string) || existing?.task || '',
            timeoutSeconds: (se.data.timeout_seconds as number) || existing?.timeoutSeconds || 300,
            startedAt: se.timestamp,
            completedAt: null,
            answerPreview: null,
            error: null,
            logPath: (se.data.log_path as string) || null,
            callId: (se.data.call_id as string) || null,
            anchorAgentId: se.agent_id,
          };

          // If batch wasn't announced yet, auto-activate
          const newPhases = { ...state.phases, [subagentId]: phase };
          const expectedIds = state.expectedPhaseIds.includes(subagentId)
            ? state.expectedPhaseIds
            : [...state.expectedPhaseIds, subagentId];

          set({
            isActive: true,
            phases: newPhases,
            expectedPhaseIds: expectedIds,
          });
          break;
        }

        case 'pre_collab_completed': {
          const subagentId = (se.data.subagent_id as string) || '';
          if (!subagentId) break;

          const existing = state.phases[subagentId];
          if (!existing) break;

          const status = (se.data.status as string) === 'completed' ? 'completed' : 'failed';
          const updated: PreCollabPhase = {
            ...existing,
            status,
            completedAt: se.timestamp,
            answerPreview: (se.data.answer_preview as string) || null,
            error: (se.data.error as string) || null,
          };

          const newPhases = { ...state.phases, [subagentId]: updated };

          // Check if all expected phases are resolved
          const allResolved = state.expectedPhaseIds.every((id) => {
            const p = newPhases[id];
            return p && (p.status === 'completed' || p.status === 'failed');
          });

          set({
            phases: newPhases,
            isActive: !allResolved,
          });
          break;
        }

        case 'personas_set': {
          const personasMap = (se.data.personas as Record<string, string>) || {};
          const personas: PreCollabPersona[] = Object.entries(personasMap).map(
            ([agentId, summary]) => ({ agentId, summary: String(summary) }),
          );
          set({
            results: { ...state.results, personas },
          });
          break;
        }

        case 'evaluation_criteria_set': {
          const rawCriteria = (se.data.criteria as Array<{ id?: string; text?: string; category?: string }>) || [];
          const evalCriteria: PreCollabCriterion[] = rawCriteria.map((c, i) => ({
            id: String(c.id || i),
            text: String(c.text || ''),
            category: String(c.category || 'standard'),
          }));
          set({
            results: { ...state.results, evalCriteria },
          });
          break;
        }

        default:
          break;
      }
    },

    openResultsPanel: (tab) => {
      const state = get();
      set({
        resultsPanelOpen: true,
        activeResultsTab: tab || state.activeResultsTab || 'personas',
      });
    },

    closeResultsPanel: () => {
      set({ resultsPanelOpen: false });
    },

    hasResults: () => {
      const { results } = get();
      return results.personas.length > 0 || results.evalCriteria.length > 0 || results.improvedPrompt !== null;
    },

    reset: () => {
      set({ ...initialState, results: { ...initialResults } });
    },
  }),
);
