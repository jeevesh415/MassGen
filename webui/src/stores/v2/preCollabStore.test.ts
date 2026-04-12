import { beforeEach, describe, expect, it } from 'vitest';
import { usePreCollabStore } from './preCollabStore';

describe('usePreCollabStore', () => {
  beforeEach(() => {
    usePreCollabStore.getState().reset();
  });

  const makeSE = (event_type: string, data: Record<string, unknown>, agent_id: string | null = null) => ({
    event_type,
    agent_id,
    data,
    timestamp: Date.now() / 1000,
  });

  describe('pre_collab_batch_announced', () => {
    it('activates the store and creates pending phases', () => {
      const store = usePreCollabStore.getState();
      store.processStructuredEvent(
        makeSE('pre_collab_batch_announced', {
          pre_collab_ids: ['persona_generation', 'criteria_generation', 'prompt_improvement'],
        }),
      );

      const state = usePreCollabStore.getState();
      expect(state.isActive).toBe(true);
      expect(state.expectedPhaseIds).toEqual(['persona_generation', 'criteria_generation', 'prompt_improvement']);
      expect(state.phases.persona_generation.status).toBe('pending');
      expect(state.phases.persona_generation.label).toBe('Personas');
      expect(state.phases.criteria_generation.label).toBe('Eval Criteria');
      expect(state.phases.prompt_improvement.label).toBe('Prompt');
    });
  });

  describe('pre_collab_started', () => {
    it('transitions phase to running with task and log_path', () => {
      const store = usePreCollabStore.getState();
      // Announce first
      store.processStructuredEvent(
        makeSE('pre_collab_batch_announced', {
          pre_collab_ids: ['persona_generation'],
        }),
      );

      store.processStructuredEvent(
        makeSE('pre_collab_started', {
          subagent_id: 'persona_generation',
          task: 'Generate personas for 3 agents',
          timeout_seconds: 300,
          log_path: '/logs/subagents/persona_generation',
          call_id: 'call_123',
        }, 'agent_a'),
      );

      const phase = usePreCollabStore.getState().phases.persona_generation;
      expect(phase.status).toBe('running');
      expect(phase.task).toBe('Generate personas for 3 agents');
      expect(phase.timeoutSeconds).toBe(300);
      expect(phase.logPath).toBe('/logs/subagents/persona_generation');
      expect(phase.anchorAgentId).toBe('agent_a');
    });

    it('auto-creates phase entry if batch was not announced', () => {
      const store = usePreCollabStore.getState();
      store.processStructuredEvent(
        makeSE('pre_collab_started', {
          subagent_id: 'persona_generation',
          task: 'Generate personas',
          timeout_seconds: 120,
        }, 'agent_a'),
      );

      const state = usePreCollabStore.getState();
      expect(state.isActive).toBe(true);
      expect(state.expectedPhaseIds).toContain('persona_generation');
      expect(state.phases.persona_generation.status).toBe('running');
    });
  });

  describe('pre_collab_completed', () => {
    it('marks phase as completed with answer preview', () => {
      const store = usePreCollabStore.getState();
      store.processStructuredEvent(
        makeSE('pre_collab_batch_announced', { pre_collab_ids: ['persona_generation'] }),
      );
      store.processStructuredEvent(
        makeSE('pre_collab_started', { subagent_id: 'persona_generation', task: 'Gen', timeout_seconds: 300 }, 'a'),
      );
      store.processStructuredEvent(
        makeSE('pre_collab_completed', {
          subagent_id: 'persona_generation',
          status: 'completed',
          answer_preview: '3 personas generated',
        }),
      );

      const state = usePreCollabStore.getState();
      expect(state.phases.persona_generation.status).toBe('completed');
      expect(state.phases.persona_generation.answerPreview).toBe('3 personas generated');
      // Only phase — should deactivate
      expect(state.isActive).toBe(false);
    });

    it('marks phase as failed with error', () => {
      const store = usePreCollabStore.getState();
      store.processStructuredEvent(
        makeSE('pre_collab_batch_announced', { pre_collab_ids: ['prompt_improvement'] }),
      );
      store.processStructuredEvent(
        makeSE('pre_collab_started', { subagent_id: 'prompt_improvement', task: 'Improve', timeout_seconds: 60 }, 'a'),
      );
      store.processStructuredEvent(
        makeSE('pre_collab_completed', {
          subagent_id: 'prompt_improvement',
          status: 'failed',
          error: 'Timeout after 60s',
        }),
      );

      const phase = usePreCollabStore.getState().phases.prompt_improvement;
      expect(phase.status).toBe('failed');
      expect(phase.error).toBe('Timeout after 60s');
    });

    it('deactivates only when ALL expected phases resolve', () => {
      const store = usePreCollabStore.getState();
      store.processStructuredEvent(
        makeSE('pre_collab_batch_announced', {
          pre_collab_ids: ['persona_generation', 'criteria_generation'],
        }),
      );
      store.processStructuredEvent(
        makeSE('pre_collab_started', { subagent_id: 'persona_generation', task: 'A', timeout_seconds: 300 }, 'a'),
      );
      store.processStructuredEvent(
        makeSE('pre_collab_started', { subagent_id: 'criteria_generation', task: 'B', timeout_seconds: 300 }, 'a'),
      );

      // Complete first phase
      store.processStructuredEvent(
        makeSE('pre_collab_completed', { subagent_id: 'persona_generation', status: 'completed' }),
      );
      expect(usePreCollabStore.getState().isActive).toBe(true);

      // Complete second phase
      store.processStructuredEvent(
        makeSE('pre_collab_completed', { subagent_id: 'criteria_generation', status: 'completed' }),
      );
      expect(usePreCollabStore.getState().isActive).toBe(false);
    });
  });

  describe('personas_set', () => {
    it('stores persona results', () => {
      const store = usePreCollabStore.getState();
      store.processStructuredEvent(
        makeSE('personas_set', {
          personas: {
            agent_a: 'Methodical analyst who focuses on data structures',
            agent_b: 'Creative explorer who seeks novel approaches',
          },
        }),
      );

      const results = usePreCollabStore.getState().results;
      expect(results.personas).toHaveLength(2);
      expect(results.personas[0].agentId).toBe('agent_a');
      expect(results.personas[0].summary).toContain('Methodical analyst');
      expect(results.personas[1].agentId).toBe('agent_b');
    });
  });

  describe('evaluation_criteria_set', () => {
    it('stores eval criteria results', () => {
      const store = usePreCollabStore.getState();
      store.processStructuredEvent(
        makeSE('evaluation_criteria_set', {
          criteria: [
            { id: '1', text: 'Code correctness', category: 'primary' },
            { id: '2', text: 'Architecture depth', category: 'standard' },
            { id: '3', text: 'Performance optimization', category: 'stretch' },
          ],
        }),
      );

      const criteria = usePreCollabStore.getState().results.evalCriteria;
      expect(criteria).toHaveLength(3);
      expect(criteria[0].text).toBe('Code correctness');
      expect(criteria[0].category).toBe('primary');
      expect(criteria[2].category).toBe('stretch');
    });
  });

  describe('results panel', () => {
    it('opens and closes the results panel', () => {
      const store = usePreCollabStore.getState();
      expect(store.resultsPanelOpen).toBe(false);

      store.openResultsPanel('criteria');
      const opened = usePreCollabStore.getState();
      expect(opened.resultsPanelOpen).toBe(true);
      expect(opened.activeResultsTab).toBe('criteria');

      store.closeResultsPanel();
      expect(usePreCollabStore.getState().resultsPanelOpen).toBe(false);
    });

    it('hasResults returns false when empty', () => {
      expect(usePreCollabStore.getState().hasResults()).toBe(false);
    });

    it('hasResults returns true when personas exist', () => {
      usePreCollabStore.getState().processStructuredEvent(
        makeSE('personas_set', { personas: { a: 'test' } }),
      );
      expect(usePreCollabStore.getState().hasResults()).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      const store = usePreCollabStore.getState();
      store.processStructuredEvent(
        makeSE('pre_collab_batch_announced', { pre_collab_ids: ['persona_generation'] }),
      );
      store.processStructuredEvent(
        makeSE('personas_set', { personas: { a: 'test' } }),
      );

      store.reset();
      const state = usePreCollabStore.getState();
      expect(state.isActive).toBe(false);
      expect(state.expectedPhaseIds).toEqual([]);
      expect(Object.keys(state.phases)).toHaveLength(0);
      expect(state.results.personas).toHaveLength(0);
    });
  });
});
