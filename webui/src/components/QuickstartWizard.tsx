/**
 * Quickstart Wizard Modal
 *
 * Full-screen modal for guided configuration setup.
 */

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Wand2, X, XCircle } from 'lucide-react';
import { useWizardStore, WizardStep } from '../stores/wizardStore';
import {
  DockerStep,
  ApiKeyStep,
  AgentCountStep,
  SetupModeStep,
  AgentConfigStep,
  CoordinationStep,
  SkillsStep,
  PreviewStep,
} from './wizard';

const stepConfig: Record<WizardStep, { title: string }> = {
  welcome: { title: 'Welcome' },
  docker: { title: 'Execution Mode' },
  apiKeys: { title: 'API Keys' },
  agentCount: { title: 'Number of Agents' },
  setupMode: { title: 'Setup Mode' },
  agentConfig: { title: 'Agent Configuration' },
  coordination: { title: 'Coordination Settings' },
  skills: { title: 'Skills' },
  preview: { title: 'Review & Save' },
};

interface QuickstartWizardProps {
  onConfigSaved?: (configPath: string) => void;
  temporaryMode?: boolean;
}

export function QuickstartWizard({ onConfigSaved, temporaryMode = false }: QuickstartWizardProps) {
  const isOpen = useWizardStore((s) => s.isOpen);
  const currentStep = useWizardStore((s) => s.currentStep);
  const isLoading = useWizardStore((s) => s.isLoading);
  const agents = useWizardStore((s) => s.agents);
  const agentCount = useWizardStore((s) => s.agentCount);

  const closeWizard = useWizardStore((s) => s.closeWizard);
  const nextStep = useWizardStore((s) => s.nextStep);
  const prevStep = useWizardStore((s) => s.prevStep);
  const saveConfig = useWizardStore((s) => s.saveConfig);
  const reset = useWizardStore((s) => s.reset);
  const [temporarySessionState, setTemporarySessionState] = useState<'idle' | 'completed' | 'cancelled'>('idle');
  const [temporaryConfigPath, setTemporaryConfigPath] = useState<string | null>(null);
  const [temporarySessionError, setTemporarySessionError] = useState<string | null>(null);
  const [temporarySessionPending, setTemporarySessionPending] = useState(false);

  const attemptWindowClose = useCallback(() => {
    window.close();
  }, []);

  const finalizeTemporarySession = useCallback(
    async (status: 'completed' | 'cancelled', configPath?: string | null) => {
      setTemporarySessionPending(true);
      setTemporarySessionError(null);

      try {
        const response = await fetch(
          status === 'completed' ? '/api/quickstart/complete' : '/api/quickstart/cancel',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body:
              status === 'completed'
                ? JSON.stringify({ config_path: configPath ?? null })
                : undefined,
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Failed to ${status === 'completed' ? 'finish' : 'cancel'} temporary quickstart session`,
          );
        }

        if (status === 'completed' && configPath && onConfigSaved) {
          onConfigSaved(configPath);
        }

        setTemporaryConfigPath(configPath ?? null);
        setTemporarySessionState(status);
        attemptWindowClose();
      } catch (err) {
        setTemporarySessionError(err instanceof Error ? err.message : 'Unexpected temporary quickstart error');
      } finally {
        setTemporarySessionPending(false);
      }
    },
    [attemptWindowClose, onConfigSaved],
  );

  const handleClose = useCallback(() => {
    if (temporaryMode && temporarySessionState === 'idle') {
      void finalizeTemporarySession('cancelled');
      return;
    }

    closeWizard();
    reset();
  }, [closeWizard, finalizeTemporarySession, reset, temporaryMode, temporarySessionState]);

  const handleSave = useCallback(async () => {
    const success = await saveConfig();
    if (success) {
      // Get the saved path from store (set by saveConfig)
      const configPath = useWizardStore.getState().savedConfigPath;

      if (temporaryMode) {
        await finalizeTemporarySession('completed', configPath);
        return;
      }

      handleClose();
      if (configPath && onConfigSaved) {
        onConfigSaved(configPath);
      }
    }
  }, [finalizeTemporarySession, handleClose, onConfigSaved, saveConfig, temporaryMode]);

  const providers = useWizardStore((s) => s.providers);
  const visibleSteps = (['docker', 'apiKeys', 'agentCount', 'setupMode', 'agentConfig', 'coordination', 'skills', 'preview'] as WizardStep[]).filter(
    (step) => {
      if (step === 'apiKeys' && providers.some((p) => p.has_api_key)) {
        return false;
      }
      if (step === 'setupMode' && agentCount === 1) {
        return false;
      }
      if (step === 'coordination' && agentCount === 1) {
        return false;
      }
      return true;
    },
  );
  const currentStepNumber = visibleSteps.indexOf(currentStep) + 1;

  // Check if we can proceed to next step
  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 'docker':
        return true; // Always can proceed from docker step
      case 'apiKeys':
        // Must have at least one provider with API key
        return providers.some((p) => p.has_api_key);
      case 'agentCount':
        return agentCount >= 1 && agentCount <= 5;
      case 'setupMode':
        return true;
      case 'agentConfig':
        // All agents must have provider and model selected
        return agents.every((agent) => agent.provider && agent.model);
      case 'coordination':
        return true; // Coordination settings are optional, defaults are fine
      case 'skills':
        return true; // Skills are optional
      case 'preview':
        return true;
      default:
        return false;
    }
  }, [currentStep, agentCount, agents, providers]);

  // Render current step content
  const renderStep = () => {
    switch (currentStep) {
      case 'docker':
        return <DockerStep />;
      case 'apiKeys':
        return <ApiKeyStep />;
      case 'agentCount':
        return <AgentCountStep />;
      case 'setupMode':
        return <SetupModeStep />;
      case 'agentConfig':
        return <AgentConfigStep />;
      case 'coordination':
        return <CoordinationStep />;
      case 'skills':
        return <SkillsStep />;
      case 'preview':
        return <PreviewStep />;
      default:
        return null;
    }
  };

  const stepInfo = stepConfig[currentStep];
  const isFirstStep = currentStep === 'docker';
  const isLastStep = currentStep === 'preview';
  const showingTemporaryResult = temporarySessionState !== 'idle';

  const renderTemporaryResult = () => {
    const completed = temporarySessionState === 'completed';

    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto py-12"
      >
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div
              className={`mb-5 flex h-16 w-16 items-center justify-center rounded-full ${
                completed
                  ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
              }`}
            >
              {completed ? <CheckCircle2 className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {completed ? 'Setup Complete' : 'Setup Cancelled'}
            </h2>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
              {completed
                ? 'The temporary quickstart session has finished. This tab can be closed if it does not close automatically.'
                : 'The temporary quickstart session has been cancelled. This tab can be closed.'}
            </p>

            {temporaryConfigPath && (
              <div className="mt-5 w-full rounded-lg bg-gray-50 dark:bg-gray-800 px-4 py-3 text-left">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Saved Config
                </div>
                <code className="mt-1 block break-all text-sm text-gray-800 dark:text-gray-200">
                  {temporaryConfigPath}
                </code>
              </div>
            )}

            {temporarySessionError && (
              <div className="mt-5 w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                {temporarySessionError}
              </div>
            )}

            <button
              type="button"
              onClick={attemptWindowClose}
              className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Close Window
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative w-full max-w-6xl mx-4 h-[90vh] bg-white dark:bg-gray-900
                       rounded-xl shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Wand2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    {showingTemporaryResult ? 'Quickstart Complete' : 'Quickstart Setup'}
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {showingTemporaryResult
                      ? 'Temporary browser session'
                      : `Step ${currentStepNumber} of ${visibleSteps.length} - ${stepInfo.title}`}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isLoading || temporarySessionPending}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400
                         dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Progress Bar */}
            {!showingTemporaryResult && (
              <div className="px-6 py-2 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                {visibleSteps.map((step, index) => {
                  const stepIndex = visibleSteps.indexOf(currentStep);
                  const isActive = index === stepIndex;
                  const isComplete = index < stepIndex;
                  return (
                    <div key={step} className="flex-1">
                      <div
                        className={`h-1.5 rounded-full transition-colors ${
                          isComplete
                            ? 'bg-blue-500'
                            : isActive
                            ? 'bg-blue-300 dark:bg-blue-600'
                            : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <AnimatePresence mode="wait">
                {showingTemporaryResult ? renderTemporaryResult() : renderStep()}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              {showingTemporaryResult ? (
                <div className="flex w-full items-center justify-end">
                  <button
                    type="button"
                    onClick={attemptWindowClose}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-white transition-colors hover:bg-blue-500"
                  >
                    <span>Close Window</span>
                  </button>
                </div>
              ) : (
                <>
              <button
                onClick={isFirstStep ? handleClose : prevStep}
                disabled={isLoading || temporarySessionPending}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400
                         hover:text-gray-800 dark:hover:text-gray-200 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{isFirstStep ? 'Cancel' : 'Back'}</span>
              </button>

              {isLastStep ? (
                <button
                  onClick={handleSave}
                  disabled={isLoading || temporarySessionPending || !canProceed()}
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-500
                           disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed
                           text-white rounded-lg transition-colors"
                >
                  {isLoading || temporarySessionPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{temporaryMode ? 'Finishing...' : 'Saving...'}</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      <span>{temporaryMode ? 'Save & Finish' : 'Save & Start'}</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={nextStep}
                  disabled={!canProceed() || temporarySessionPending}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500
                           disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed
                           text-white rounded-lg transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
