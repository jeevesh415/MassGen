import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModeStore } from './modeStore';

describe('useModeStore', () => {
  beforeEach(() => {
    useModeStore.getState().reset();
  });

  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useModeStore.getState();
      expect(state.coordinationMode).toBe('parallel');
      expect(state.agentMode).toBe('multi');
      expect(state.selectedSingleAgent).toBeNull();
      expect(state.refinementEnabled).toBe(true);
      expect(state.personasMode).toBe('off');
      expect(state.planMode).toBe('normal');
      expect(state.agentCount).toBeNull();
      expect(state.agentConfigs).toEqual([]);
      expect(state.dynamicModels).toEqual({});
      expect(state.loadingModels).toEqual({});
      expect(state.providerCapabilities).toEqual({});
      expect(state.reasoningProfiles).toEqual({});
      expect(state.maxAnswers).toBeNull();
      expect(state.dockerEnabled).toBeNull();
      expect(state.dockerAvailable).toBeNull();
      expect(state.dockerStatus).toBeNull();
      expect(state.executionLocked).toBe(false);
      expect(state.evalCriteriaEnabled).toBe(false);
      expect(state.promptImproverEnabled).toBe(false);
    });
  });

  describe('getOverrides', () => {
    it('returns parallel + voting for default state', () => {
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.coordination_mode).toBe('voting');
      // Refinement is on by default, so no quick-mode keys
      expect(overrides.max_new_answers_per_agent).toBeUndefined();
      expect(overrides.skip_voting).toBeUndefined();
    });

    it('returns decomposition coordination_mode', () => {
      useModeStore.getState().setCoordinationMode('decomposition');
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.coordination_mode).toBe('decomposition');
    });

    it('falls back to voting when single agent + decomposition', () => {
      useModeStore.getState().setCoordinationMode('decomposition');
      useModeStore.getState().setAgentMode('single');
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.coordination_mode).toBe('voting');
    });

    it('multi + refinement off = quick mode (multi-agent)', () => {
      useModeStore.getState().setRefinementEnabled(false);
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.max_new_answers_per_agent).toBe(1);
      expect(overrides.skip_final_presentation).toBe(true);
      expect(overrides.disable_injection).toBe(true);
      expect(overrides.defer_voting_until_all_answered).toBe(true);
      expect(overrides.final_answer_strategy).toBe('synthesize');
      // Should NOT have skip_voting (that's single-agent only)
      expect(overrides.skip_voting).toBeUndefined();
    });

    it('single + refinement off = quick mode (single-agent)', () => {
      useModeStore.getState().setAgentMode('single');
      useModeStore.getState().setRefinementEnabled(false);
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.max_new_answers_per_agent).toBe(1);
      expect(overrides.skip_final_presentation).toBe(true);
      expect(overrides.skip_voting).toBe(true);
      // Should NOT have multi-agent quick mode keys
      expect(overrides.disable_injection).toBeUndefined();
      expect(overrides.defer_voting_until_all_answered).toBeUndefined();
    });

    it('single + refinement on = voting kept (no quick mode keys)', () => {
      useModeStore.getState().setAgentMode('single');
      useModeStore.getState().setRefinementEnabled(true);
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.coordination_mode).toBe('voting');
      expect(overrides.max_new_answers_per_agent).toBeUndefined();
      expect(overrides.skip_voting).toBeUndefined();
    });

    it('includes persona overrides when enabled', () => {
      useModeStore.getState().setPersonasMode('perspective');
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.persona_generator_enabled).toBe(true);
      expect(overrides.persona_diversity_mode).toBe('perspective');
    });

    it('does not include persona overrides when off', () => {
      useModeStore.getState().setPersonasMode('off');
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.persona_generator_enabled).toBeUndefined();
      expect(overrides.persona_diversity_mode).toBeUndefined();
    });

    it('includes max_new_answers_per_agent when maxAnswers is set and refinement on', () => {
      useModeStore.getState().setMaxAnswers(3);
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.max_new_answers_per_agent).toBe(3);
    });

    it('quick mode overrides maxAnswers (refinement off forces 1)', () => {
      useModeStore.getState().setMaxAnswers(7);
      useModeStore.getState().setRefinementEnabled(false);
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.max_new_answers_per_agent).toBe(1);
    });

    it('does not include max_new_answers_per_agent when maxAnswers is null', () => {
      const overrides = useModeStore.getState().getOverrides();
      // Default: refinement on, maxAnswers null → no override
      expect(overrides.max_new_answers_per_agent).toBeUndefined();
    });

    it('includes agent_count when set', () => {
      useModeStore.getState().setAgentCount(5);
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.agent_count).toBe(5);
    });

    it('includes docker_override when set', () => {
      useModeStore.getState().setDockerEnabled(true);
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.docker_override).toBe(true);
    });

    it('does not include null agent config overrides', () => {
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.agent_count).toBeUndefined();
      expect(overrides.agent_overrides).toBeUndefined();
      expect(overrides.docker_override).toBeUndefined();
    });

    it('combines orchestrator and agent overrides', () => {
      useModeStore.getState().setRefinementEnabled(false);
      useModeStore.getState().setAgentCount(4);
      useModeStore.getState().setAgentConfig(0, { provider: 'openai', model: 'gpt-4o' });
      const overrides = useModeStore.getState().getOverrides();
      // Orchestrator overrides
      expect(overrides.coordination_mode).toBe('voting');
      expect(overrides.max_new_answers_per_agent).toBe(1);
      // Agent overrides
      expect(overrides.agent_count).toBe(4);
      expect(overrides.agent_overrides).toBeDefined();
      expect((overrides.agent_overrides as Array<Record<string, string>>)[0].model).toBe('gpt-4o');
    });

    it('includes agent_overrides when configs have values', () => {
      useModeStore.getState().setAgentCount(3);
      useModeStore.getState().setAgentConfig(1, { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' });
      const overrides = useModeStore.getState().getOverrides();
      const agentOverrides = overrides.agent_overrides as Array<Record<string, string>>;
      expect(agentOverrides).toBeDefined();
      expect(agentOverrides).toHaveLength(3);
      // Index 0: all null -> empty object
      expect(agentOverrides[0]).toEqual({});
      // Index 1: has values
      expect(agentOverrides[1]).toEqual({ backend_type: 'anthropic', model: 'claude-sonnet-4-5-20250514' });
      // Index 2: all null -> empty object
      expect(agentOverrides[2]).toEqual({});
    });

    it('omits agent_overrides when all configs are null', () => {
      useModeStore.getState().setAgentCount(3);
      // No setAgentConfig calls — all entries have null provider/model
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.agent_overrides).toBeUndefined();
    });

    it('includes eval criteria override when enabled', () => {
      useModeStore.getState().setEvalCriteriaEnabled(true);
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.evaluation_criteria_generator_enabled).toBe(true);
    });

    it('includes prompt improver override when enabled', () => {
      useModeStore.getState().setPromptImproverEnabled(true);
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.prompt_improver_enabled).toBe(true);
    });

    it('does not include eval/prompt overrides when disabled', () => {
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.evaluation_criteria_generator_enabled).toBeUndefined();
      expect(overrides.prompt_improver_enabled).toBeUndefined();
    });

    it('agent_overrides only includes non-null fields', () => {
      useModeStore.getState().setAgentCount(2);
      // Provider only
      useModeStore.getState().setAgentConfig(0, { provider: 'openai' });
      // Model only
      useModeStore.getState().setAgentConfig(1, { model: 'gpt-4o' });
      const overrides = useModeStore.getState().getOverrides();
      const agentOverrides = overrides.agent_overrides as Array<Record<string, string>>;
      expect(agentOverrides[0]).toEqual({ backend_type: 'openai' });
      expect(agentOverrides[1]).toEqual({ model: 'gpt-4o' });
    });

    it('includes plan mode overrides when not normal', () => {
      useModeStore.getState().setPlanMode('plan');
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.plan_mode).toBe('plan');
      expect(overrides.enable_agent_task_planning).toBe(true);
      expect(overrides.task_planning_filesystem_mode).toBe(true);
    });

    it('omits plan mode overrides when normal', () => {
      useModeStore.getState().setPlanMode('normal');
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.plan_mode).toBeUndefined();
      expect(overrides.enable_agent_task_planning).toBeUndefined();
      expect(overrides.task_planning_filesystem_mode).toBeUndefined();
    });

    it('includes spec mode when plan mode is spec', () => {
      useModeStore.getState().setPlanMode('spec');
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.plan_mode).toBe('spec');
      expect(overrides.enable_agent_task_planning).toBe(true);
    });

    it('includes analyze mode when plan mode is analyze', () => {
      useModeStore.getState().setPlanMode('analyze');
      const overrides = useModeStore.getState().getOverrides();
      expect(overrides.plan_mode).toBe('analyze');
      expect(overrides.enable_agent_task_planning).toBe(true);
    });

    it('agent_overrides includes reasoning/search/code fields', () => {
      useModeStore.getState().setAgentCount(2);
      useModeStore.getState().setAgentConfig(0, {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
        reasoningEffort: 'high',
        enableWebSearch: true,
        enableCodeExecution: false,
      });
      const overrides = useModeStore.getState().getOverrides();
      const agentOverrides = overrides.agent_overrides as Array<Record<string, unknown>>;
      expect(agentOverrides[0]).toEqual({
        backend_type: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
        reasoning_effort: 'high',
        enable_web_search: true,
        enable_code_execution: false,
      });
      // Second agent: all null -> empty
      expect(agentOverrides[1]).toEqual({});
    });

    it('agent_overrides omits null feature fields', () => {
      useModeStore.getState().setAgentCount(1);
      useModeStore.getState().setAgentConfig(0, {
        provider: 'openai',
        reasoningEffort: 'low',
        // enableWebSearch and enableCodeExecution left as null
      });
      const overrides = useModeStore.getState().getOverrides();
      const agentOverrides = overrides.agent_overrides as Array<Record<string, unknown>>;
      expect(agentOverrides[0]).toEqual({
        backend_type: 'openai',
        reasoning_effort: 'low',
      });
    });
  });

  describe('setAgentCount', () => {
    it('grows agentConfigs array', () => {
      useModeStore.getState().setAgentCount(3);
      const state = useModeStore.getState();
      expect(state.agentConfigs).toHaveLength(3);
      expect(state.agentConfigs).toEqual([
        { provider: null, model: null, reasoningEffort: null, enableWebSearch: null, enableCodeExecution: null },
        { provider: null, model: null, reasoningEffort: null, enableWebSearch: null, enableCodeExecution: null },
        { provider: null, model: null, reasoningEffort: null, enableWebSearch: null, enableCodeExecution: null },
      ]);
    });

    it('shrinks agentConfigs array', () => {
      useModeStore.getState().setAgentCount(3);
      useModeStore.getState().setAgentCount(1);
      const state = useModeStore.getState();
      expect(state.agentConfigs).toHaveLength(1);
    });

    it('clears agentConfigs when set to null', () => {
      useModeStore.getState().setAgentCount(3);
      useModeStore.getState().setAgentCount(null);
      const state = useModeStore.getState();
      expect(state.agentConfigs).toEqual([]);
      expect(state.agentCount).toBeNull();
    });

    it('preserves existing configs when growing', () => {
      useModeStore.getState().setAgentCount(2);
      useModeStore.getState().setAgentConfig(0, { provider: 'openai', model: 'gpt-4o' });
      useModeStore.getState().setAgentCount(4);
      const state = useModeStore.getState();
      expect(state.agentConfigs).toHaveLength(4);
      expect(state.agentConfigs[0].provider).toBe('openai');
      expect(state.agentConfigs[0].model).toBe('gpt-4o');
      expect(state.agentConfigs[2].provider).toBeNull();
    });
  });

  describe('setAgentConfig', () => {
    it('updates specific agent with partial updates', () => {
      useModeStore.getState().setAgentCount(3);
      useModeStore.getState().setAgentConfig(1, { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' });
      const state = useModeStore.getState();
      expect(state.agentConfigs[0].provider).toBeNull();
      expect(state.agentConfigs[1].provider).toBe('anthropic');
      expect(state.agentConfigs[1].model).toBe('claude-sonnet-4-5-20250514');
      expect(state.agentConfigs[1].reasoningEffort).toBeNull();
      expect(state.agentConfigs[2].provider).toBeNull();
    });

    it('ignores out-of-bounds index', () => {
      useModeStore.getState().setAgentCount(2);
      useModeStore.getState().setAgentConfig(5, { provider: 'openai', model: 'gpt-4o' });
      const state = useModeStore.getState();
      expect(state.agentConfigs).toHaveLength(2);
      expect(state.agentConfigs[0].provider).toBeNull();
    });

    it('merges partial updates preserving existing values', () => {
      useModeStore.getState().setAgentCount(1);
      useModeStore.getState().setAgentConfig(0, { provider: 'openai', model: 'gpt-4o' });
      useModeStore.getState().setAgentConfig(0, { reasoningEffort: 'high' });
      const state = useModeStore.getState();
      expect(state.agentConfigs[0].provider).toBe('openai');
      expect(state.agentConfigs[0].model).toBe('gpt-4o');
      expect(state.agentConfigs[0].reasoningEffort).toBe('high');
    });
  });

  describe('applyToAllAgents', () => {
    it('copies config to all agents', () => {
      useModeStore.getState().setAgentCount(3);
      useModeStore.getState().setAgentConfig(0, {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
        reasoningEffort: 'high',
        enableWebSearch: true,
        enableCodeExecution: false,
      });
      useModeStore.getState().applyToAllAgents(0);
      const state = useModeStore.getState();
      for (let i = 0; i < 3; i++) {
        expect(state.agentConfigs[i].provider).toBe('anthropic');
        expect(state.agentConfigs[i].model).toBe('claude-sonnet-4-5-20250514');
        expect(state.agentConfigs[i].reasoningEffort).toBe('high');
        expect(state.agentConfigs[i].enableWebSearch).toBe(true);
        expect(state.agentConfigs[i].enableCodeExecution).toBe(false);
      }
    });
  });

  describe('setPlanMode', () => {
    it('updates plan mode', () => {
      useModeStore.getState().setPlanMode('plan');
      expect(useModeStore.getState().planMode).toBe('plan');
    });

    it('cycles through all modes', () => {
      const modes = ['normal', 'plan', 'spec', 'analyze'] as const;
      for (const mode of modes) {
        useModeStore.getState().setPlanMode(mode);
        expect(useModeStore.getState().planMode).toBe(mode);
      }
    });
  });

  describe('lock / unlock', () => {
    it('locks and unlocks', () => {
      useModeStore.getState().lock();
      expect(useModeStore.getState().executionLocked).toBe(true);
      useModeStore.getState().unlock();
      expect(useModeStore.getState().executionLocked).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears all state to defaults', () => {
      const store = useModeStore.getState();
      store.setCoordinationMode('decomposition');
      store.setAgentMode('single');
      store.setRefinementEnabled(false);
      store.setPlanMode('plan');
      store.setAgentCount(5);
      store.setAgentConfig(0, { provider: 'openai', model: 'gpt-4o' });
      store.lock();

      store.reset();

      const state = useModeStore.getState();
      expect(state.coordinationMode).toBe('parallel');
      expect(state.agentMode).toBe('multi');
      expect(state.refinementEnabled).toBe(true);
      expect(state.planMode).toBe('normal');
      expect(state.agentCount).toBeNull();
      expect(state.agentConfigs).toEqual([]);
      expect(state.maxAnswers).toBeNull();
      expect(state.dynamicModels).toEqual({});
      expect(state.loadingModels).toEqual({});
      expect(state.providerCapabilities).toEqual({});
      expect(state.reasoningProfiles).toEqual({});
      expect(state.dockerAvailable).toBeNull();
      expect(state.dockerStatus).toBeNull();
      expect(state.executionLocked).toBe(false);
    });
  });

  describe('setters', () => {
    it('setCoordinationMode', () => {
      useModeStore.getState().setCoordinationMode('decomposition');
      expect(useModeStore.getState().coordinationMode).toBe('decomposition');
    });

    it('setAgentMode', () => {
      useModeStore.getState().setAgentMode('single');
      expect(useModeStore.getState().agentMode).toBe('single');
    });

    it('setSelectedSingleAgent', () => {
      useModeStore.getState().setSelectedSingleAgent('agent_b');
      expect(useModeStore.getState().selectedSingleAgent).toBe('agent_b');
    });

    it('setPersonasMode cycles through modes', () => {
      useModeStore.getState().setPersonasMode('methodology');
      expect(useModeStore.getState().personasMode).toBe('methodology');
    });

    it('setDockerEnabled', () => {
      useModeStore.getState().setDockerEnabled(false);
      expect(useModeStore.getState().dockerEnabled).toBe(false);
    });

    it('setMaxAnswers', () => {
      useModeStore.getState().setMaxAnswers(7);
      expect(useModeStore.getState().maxAnswers).toBe(7);
      useModeStore.getState().setMaxAnswers(null);
      expect(useModeStore.getState().maxAnswers).toBeNull();
    });

    it('setEvalCriteriaEnabled', () => {
      useModeStore.getState().setEvalCriteriaEnabled(true);
      expect(useModeStore.getState().evalCriteriaEnabled).toBe(true);
      useModeStore.getState().setEvalCriteriaEnabled(false);
      expect(useModeStore.getState().evalCriteriaEnabled).toBe(false);
    });

    it('setPromptImproverEnabled', () => {
      useModeStore.getState().setPromptImproverEnabled(true);
      expect(useModeStore.getState().promptImproverEnabled).toBe(true);
      useModeStore.getState().setPromptImproverEnabled(false);
      expect(useModeStore.getState().promptImproverEnabled).toBe(false);
    });
  });

  describe('custom config persistence', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('has correct initial custom config state', () => {
      const state = useModeStore.getState();
      expect(state.customConfigPath).toBeNull();
      expect(state.needsFirstTimeSetup).toBe(false);
    });

    it('restoreState sets customConfigPath when config exists', async () => {
      const mockResponse = {
        exists: true,
        config_path: '/project/.massgen/webui_config.yaml',
        ui_state: {
          coordinationMode: 'decomposition',
          refinementEnabled: false,
          personasMode: 'perspective',
          planMode: 'plan',
          maxAnswers: 3,
          agentMode: 'multi',
          agentCount: 3,
          agentConfigs: [
            { provider: 'openai', model: 'gpt-4o', reasoningEffort: null, enableWebSearch: null, enableCodeExecution: null },
            { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514', reasoningEffort: 'high', enableWebSearch: null, enableCodeExecution: null },
            { provider: null, model: null, reasoningEffort: null, enableWebSearch: null, enableCodeExecution: null },
          ],
        },
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await useModeStore.getState().restoreState();

      const state = useModeStore.getState();
      expect(state.customConfigPath).toBe('/project/.massgen/webui_config.yaml');
      expect(state.needsFirstTimeSetup).toBe(false);
      expect(state.coordinationMode).toBe('decomposition');
      expect(state.refinementEnabled).toBe(false);
      expect(state.personasMode).toBe('perspective');
      expect(state.planMode).toBe('plan');
      expect(state.maxAnswers).toBe(3);
      expect(state.agentCount).toBe(3);
      expect(state.agentConfigs).toHaveLength(3);
      // Verify per-agent configs are restored, not empty defaults
      expect(state.agentConfigs[0].provider).toBe('openai');
      expect(state.agentConfigs[0].model).toBe('gpt-4o');
      expect(state.agentConfigs[1].provider).toBe('anthropic');
      expect(state.agentConfigs[1].model).toBe('claude-sonnet-4-5-20250514');
      expect(state.agentConfigs[1].reasoningEffort).toBe('high');
      expect(state.agentConfigs[2].provider).toBeNull();
    });

    it('restoreState sets needsFirstTimeSetup when no config exists', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ exists: false, config_path: null, ui_state: null }),
      } as Response);

      await useModeStore.getState().restoreState();

      const state = useModeStore.getState();
      expect(state.customConfigPath).toBeNull();
      expect(state.needsFirstTimeSetup).toBe(true);
      expect(state.maxAnswers).toBe(5);
    });

    it('persistState posts to save-state and updates customConfigPath', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          config_path: '/project/.massgen/webui_config.yaml',
        }),
      } as Response);

      useModeStore.getState().setAgentCount(2);
      useModeStore.getState().setAgentConfig(0, { provider: 'openai', model: 'gpt-4o' });
      await useModeStore.getState().persistState();

      expect(fetchMock).toHaveBeenCalledWith('/api/webui/save-state', expect.objectContaining({
        method: 'POST',
      }));

      const state = useModeStore.getState();
      expect(state.customConfigPath).toBe('/project/.massgen/webui_config.yaml');
      expect(state.needsFirstTimeSetup).toBe(false);
    });

    it('reset clears custom config state', () => {
      useModeStore.setState({
        customConfigPath: '/some/path.yaml',
        needsFirstTimeSetup: true,
      });
      useModeStore.getState().reset();
      const state = useModeStore.getState();
      expect(state.customConfigPath).toBeNull();
      expect(state.needsFirstTimeSetup).toBe(false);
    });
  });
});
