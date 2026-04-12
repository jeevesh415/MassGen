/**
 * Coordination Step Component
 *
 * Keep quickstart coordination aligned with the terminal wizard:
 * mode selection, presenter choice, and decomposition answer caps only.
 */

import { motion } from 'framer-motion';
import { Settings, Vote, Info, ListOrdered, GitBranch } from 'lucide-react';
import { useWizardStore } from '../../stores/wizardStore';
import { GuideTip } from '../v2/onboarding/GuideTip';

export function CoordinationStep() {
  const coordinationSettings = useWizardStore((s) => s.coordinationSettings);
  const setCoordinationSettings = useWizardStore((s) => s.setCoordinationSettings);
  const agentCount = useWizardStore((s) => s.agentCount);
  const agents = useWizardStore((s) => s.agents);
  const coordinationMode = coordinationSettings.coordination_mode ?? 'voting';
  const defaultPresenterAgent = agents[agents.length - 1]?.id ?? 'agent_a';
  const defaultGlobalCap = Math.max(3, agentCount * 3);

  const handleCoordinationModeChange = (mode: 'voting' | 'decomposition') => {
    if (mode === 'decomposition') {
      setCoordinationSettings({
        coordination_mode: 'decomposition',
        presenter_agent: coordinationSettings.presenter_agent ?? defaultPresenterAgent,
        max_new_answers_per_agent: coordinationSettings.max_new_answers_per_agent ?? 2,
        max_new_answers_global: coordinationSettings.max_new_answers_global ?? defaultGlobalCap,
      });
      return;
    }

    setCoordinationSettings({
      coordination_mode: 'voting',
      presenter_agent: undefined,
      max_new_answers_per_agent: undefined,
      max_new_answers_global: undefined,
    });
  };

  const handleMaxAnswersChange = (value: string) => {
    const num = parseInt(value, 10);
    setCoordinationSettings({
      max_new_answers_per_agent: Number.isNaN(num) || num <= 0 ? undefined : num,
    });
  };

  const handleMaxGlobalAnswersChange = (value: string) => {
    const num = parseInt(value, 10);
    setCoordinationSettings({
      max_new_answers_global: Number.isNaN(num) || num <= 0 ? undefined : num,
    });
  };

  const handlePresenterAgentChange = (value: string) => {
    setCoordinationSettings({ presenter_agent: value || undefined });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-3"
    >
      <GuideTip
        tipId="coordination-defaults"
        title="Defaults work well"
        body="For most tasks, the default voting coordination produces great results. Leave these settings as-is unless you have specific needs."
      />
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Settings className="w-4 h-4 text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Coordination Settings
          </h2>
          <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
            Optional
          </span>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Use checklist-gated voting by default, or switch to decomposition for a presenter and tighter answer caps.
        </p>
      </div>

      <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Voting uses built-in checklist defaults. Decomposition adds a presenter, per-agent cap, and team-wide cap.
        </p>
      </div>

      <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-md">
            {coordinationMode === 'decomposition' ? (
              <GitBranch className="w-4 h-4 text-blue-500" />
            ) : (
              <Vote className="w-4 h-4 text-blue-500" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">Coordination Mode</h3>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => handleCoordinationModeChange('voting')}
            className={`rounded-md border px-3 py-2 text-left transition-all ${
              coordinationMode === 'voting'
                ? 'border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-1.5 font-medium text-sm text-gray-800 dark:text-gray-200">
              <Vote className="w-3.5 h-3.5 text-blue-500" />
              Voting
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Parallel work with checklist-gated voting and refinement.
            </p>
          </button>
          <button
            type="button"
            onClick={() => handleCoordinationModeChange('decomposition')}
            className={`rounded-md border px-3 py-2 text-left transition-all ${
              coordinationMode === 'decomposition'
                ? 'border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-1.5 font-medium text-sm text-gray-800 dark:text-gray-200">
              <GitBranch className="w-3.5 h-3.5 text-blue-500" />
              Decomposition
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Subtask specialization with a presenter for final assembly.
            </p>
          </button>
        </div>

        {coordinationMode === 'decomposition' && (
          <div className="mt-3 space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Presenter
                </label>
                <select
                  value={coordinationSettings.presenter_agent ?? defaultPresenterAgent}
                  onChange={(e) => handlePresenterAgentChange(e.target.value)}
                  className="w-full px-2 py-1.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600
                             rounded-md text-gray-800 dark:text-gray-200 text-xs
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Max per Agent
                </label>
                <div className="relative">
                  <ListOrdered className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="number"
                    min="1"
                    value={coordinationSettings.max_new_answers_per_agent ?? ''}
                    onChange={(e) => handleMaxAnswersChange(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-7 pr-2 text-xs text-gray-800
                               placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500
                               dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Max Global
                </label>
                <input
                  type="number"
                  min="1"
                  value={coordinationSettings.max_new_answers_global ?? ''}
                  onChange={(e) => handleMaxGlobalAnswersChange(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800
                             placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500
                             dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-md">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-300">Current: </span>
          <span className="font-medium text-blue-600 dark:text-blue-400">{coordinationMode}</span>
          {coordinationMode === 'voting' ? (
            <> — default checklist-gated voting.</>
          ) : (
            <>
              {' '}— presenter: <span className="font-medium text-blue-600 dark:text-blue-400">
                {coordinationSettings.presenter_agent ?? defaultPresenterAgent}
              </span>, per-agent: <span className="font-medium text-blue-600 dark:text-blue-400">
                {coordinationSettings.max_new_answers_per_agent ?? 2}
              </span>, global: <span className="font-medium text-blue-600 dark:text-blue-400">
                {coordinationSettings.max_new_answers_global ?? defaultGlobalCap}
              </span>.
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
