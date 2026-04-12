/**
 * Setup Page
 *
 * Standalone setup wizard for configuring MassGen:
 * - API keys
 * - Docker setup
 * - Skills selection (basic)
 *
 * Section components are extracted into components/setup/ for reuse in the v2 overlay.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Key,
  Container,
  Puzzle,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import {
  useSetupStore,
  selectCurrentStep,
  selectApiKeyInputs,
  selectSavingApiKeys,
  type SetupStep,
} from '../stores/setupStore';
import { useThemeStore } from '../stores/themeStore';
import { ApiKeysSection } from '../components/setup/ApiKeysSection';
import { DockerSection } from '../components/setup/DockerSection';
import { SkillsSection } from '../components/setup/SkillsSection';

// Step configuration
const steps: { id: SetupStep; title: string; icon: typeof Key }[] = [
  { id: 'apiKeys', title: 'API Keys', icon: Key },
  { id: 'docker', title: 'Docker Setup', icon: Container },
  { id: 'skills', title: 'Skills', icon: Puzzle },
];

// Main Setup Page Component
export function SetupPage() {
  const currentStep = useSetupStore(selectCurrentStep);
  const nextStep = useSetupStore((s) => s.nextStep);
  const prevStep = useSetupStore((s) => s.prevStep);
  const setStep = useSetupStore((s) => s.setStep);
  const saveApiKeys = useSetupStore((s) => s.saveApiKeys);
  const apiKeyInputs = useSetupStore(selectApiKeyInputs);
  const savingApiKeys = useSetupStore(selectSavingApiKeys);
  const temporaryMode = new URLSearchParams(window.location.search).get('temporary') === '1';
  const [temporaryCancelPending, setTemporaryCancelPending] = useState(false);
  const [temporaryCancelMessage, setTemporaryCancelMessage] = useState<string | null>(null);

  // Theme
  const getEffectiveTheme = useThemeStore((s) => s.getEffectiveTheme);
  const themeMode = useThemeStore((s) => s.mode);

  useEffect(() => {
    const effectiveTheme = getEffectiveTheme();
    const root = document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [getEffectiveTheme, themeMode]);

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  // Check if there are any non-empty API keys to save
  const hasApiKeysToSave = Object.values(apiKeyInputs).some(v => v && v.trim());

  const handleNext = async () => {
    // Auto-save API keys when leaving the apiKeys step
    if (currentStep === 'apiKeys' && hasApiKeysToSave) {
      await saveApiKeys();
    }
    nextStep();
  };

  const handleFinish = () => {
    // Navigate to main app and auto-open quickstart wizard
    window.location.href = temporaryMode ? '/?wizard=open&temporary=1' : '/?wizard=open';
  };

  const handleTemporaryCancel = async () => {
    setTemporaryCancelPending(true);
    setTemporaryCancelMessage(null);

    try {
      const response = await fetch('/api/quickstart/cancel', { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to cancel temporary quickstart session');
      }

      setTemporaryCancelMessage('Setup cancelled. You can close this tab.');
      window.close();
    } catch (err) {
      setTemporaryCancelMessage(
        err instanceof Error ? err.message : 'Temporary quickstart cancellation failed',
      );
    } finally {
      setTemporaryCancelPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              MassGen Setup
            </h1>
          </div>
          {temporaryMode ? (
            <button
              type="button"
              onClick={handleTemporaryCancel}
              disabled={temporaryCancelPending}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {temporaryCancelPending ? 'Cancelling...' : 'Cancel Setup'}
            </button>
          ) : (
            <a
              href="/"
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 text-sm"
            >
              Skip to App <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </header>

      {temporaryCancelMessage && (
        <div className="px-6 pt-4">
          <div className="max-w-4xl mx-auto rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            {temporaryCancelMessage}
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = step.id === currentStep;
              const isCompleted = index < currentStepIndex;

              return (
                <button
                  key={step.id}
                  onClick={() => setStep(step.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                      : isCompleted
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : isCompleted
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  >
                    {isCompleted ? <Check className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                  </div>
                  <span className="font-medium">{step.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content - pb-24 accounts for fixed footer */}
      <main className="px-6 py-8 pb-24">
        <div className="max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {currentStep === 'apiKeys' && <ApiKeysSection />}
              {currentStep === 'docker' && <DockerSection />}
              {currentStep === 'skills' && <SkillsSection />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Footer Navigation */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={prevStep}
            disabled={isFirstStep}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          <div className="text-sm text-gray-500">
            Step {currentStepIndex + 1} of {steps.length}
          </div>

          {isLastStep ? (
            <button
              onClick={handleFinish}
              className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg flex items-center gap-2"
            >
              Finish Setup <Check className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={savingApiKeys}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white rounded-lg flex items-center gap-2"
            >
              {savingApiKeys ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  Next <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

export default SetupPage;
