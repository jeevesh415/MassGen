/**
 * Agent Count Step Component
 *
 * Second step - choose number of agents.
 * Full-bleed layout: large cards in a horizontal row, vertically centered.
 */

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useWizardStore } from '../../stores/wizardStore';

const agentOptions = [
  { count: 1, label: '1', description: 'Single agent', detail: 'Iterative refinement with one model' },
  { count: 2, label: '2', description: 'Pair collaboration', detail: 'Two viewpoints, compare approaches' },
  { count: 3, label: '3', description: 'Recommended', recommended: true, detail: 'Balanced diversity with voting consensus' },
  { count: 4, label: '4', description: 'More perspectives', detail: 'Wider exploration, higher cost' },
  { count: 5, label: '5', description: 'Max collaboration', detail: 'Maximum diversity, highest API usage' },
];

export function AgentCountStep() {
  const agentCount = useWizardStore((s) => s.agentCount);
  const setAgentCount = useWizardStore((s) => s.setAgentCount);

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
            How many agents?
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            More agents provide diverse perspectives but use more API credits.
          </p>
        </div>

        <div className="grid grid-cols-5 gap-3 w-full">
          {agentOptions.map((option) => (
            <button
              key={option.count}
              onClick={() => setAgentCount(option.count)}
              className={`relative flex flex-col items-center justify-center py-8 px-3 rounded-xl border-2 text-center transition-all min-h-[180px] ${
                agentCount === option.count
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md shadow-blue-500/10'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md'
              }`}
            >
              {option.recommended && (
                <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full whitespace-nowrap font-medium">
                  Recommended
                </span>
              )}
              {agentCount === option.count && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div className="text-4xl font-bold text-gray-800 dark:text-gray-200 mb-2">
                {option.label}
              </div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {option.description}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {option.detail}
              </div>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
