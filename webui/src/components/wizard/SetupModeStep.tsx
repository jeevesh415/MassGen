/**
 * Setup Mode Step Component
 *
 * Third step (for 2+ agents) - choose same or different providers.
 * Full-bleed layout: two large side-by-side panels, vertically centered.
 * "Different per agent" is the default and appears first (left).
 */

import { motion } from 'framer-motion';
import { Copy, Shuffle, Check, Users, Layers } from 'lucide-react';
import { useWizardStore } from '../../stores/wizardStore';

export function SetupModeStep() {
  const setupMode = useWizardStore((s) => s.setupMode);
  const setSetupMode = useWizardStore((s) => s.setSetupMode);
  const agentCount = useWizardStore((s) => s.agentCount);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col items-center justify-center"
    >
      <div className="w-full">
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-1">
            Setup Mode
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configure how your {agentCount} agents will be set up.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          {/* Different Config Option (default, first/left) */}
          <button
            onClick={() => setSetupMode('different')}
            className={`w-full p-6 rounded-xl border-2 text-left transition-all flex flex-col gap-4 min-h-[220px] ${
              setupMode === 'different'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md shadow-blue-500/10'
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${
                  setupMode === 'different'
                    ? 'bg-blue-500/10'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <Shuffle className={`w-6 h-6 ${setupMode === 'different' ? 'text-blue-500' : 'text-gray-500'}`} />
                </div>
                <div>
                  <span className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    Different per agent
                  </span>
                  <span className="ml-2 text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full font-medium">
                    Recommended
                  </span>
                </div>
              </div>
              {setupMode === 'different' && (
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400">
              Configure each agent with a different provider and model. Great for diverse perspectives.
            </p>

            <div className="flex-1" />

            <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span>Mix providers for diverse reasoning styles</span>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span>Each agent gets independent configuration</span>
              </div>
            </div>
          </button>

          {/* Same Config Option */}
          <button
            onClick={() => setSetupMode('same')}
            className={`w-full p-6 rounded-xl border-2 text-left transition-all flex flex-col gap-4 min-h-[220px] ${
              setupMode === 'same'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md shadow-blue-500/10'
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${
                  setupMode === 'same'
                    ? 'bg-blue-500/10'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <Copy className={`w-6 h-6 ${setupMode === 'same' ? 'text-blue-500' : 'text-gray-500'}`} />
                </div>
                <span className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  Same for all
                </span>
              </div>
              {setupMode === 'same' && (
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400">
              Use the same provider and model for all agents. Quick setup for comparing agent responses.
            </p>

            <div className="flex-1" />

            <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <Copy className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span>Configure once, applies to all {agentCount} agents</span>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span>Leverage diversity within a single model</span>
              </div>
            </div>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
