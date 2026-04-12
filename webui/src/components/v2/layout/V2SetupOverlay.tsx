/**
 * V2 Setup Overlay
 *
 * Full-screen overlay for setup (API Keys, Docker, Skills),
 * following the same pattern as V2QuickstartWizard.
 */

import { useCallback } from 'react';
import { cn } from '../../../lib/utils';
import {
  useSetupStore,
  selectCurrentStep,
  selectApiKeyInputs,
  selectSavingApiKeys,
  type SetupStep,
} from '../../../stores/setupStore';
import { ApiKeysSection } from '../../setup/ApiKeysSection';
import { DockerSection } from '../../setup/DockerSection';
import { SkillsSection } from '../../setup/SkillsSection';

const stepConfig: Record<SetupStep, { title: string }> = {
  apiKeys: { title: 'API Keys' },
  docker: { title: 'Docker Setup' },
  skills: { title: 'Skills' },
};

const stepOrder: SetupStep[] = ['apiKeys', 'docker', 'skills'];

export function V2SetupOverlay() {
  const currentStep = useSetupStore(selectCurrentStep);
  const apiKeyInputs = useSetupStore(selectApiKeyInputs);
  const savingApiKeys = useSetupStore(selectSavingApiKeys);

  const nextStep = useSetupStore((s) => s.nextStep);
  const prevStep = useSetupStore((s) => s.prevStep);
  const closeSetup = useSetupStore((s) => s.closeSetup);
  const saveApiKeys = useSetupStore((s) => s.saveApiKeys);

  const currentStepIndex = stepOrder.indexOf(currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === stepOrder.length - 1;

  const hasApiKeysToSave = Object.values(apiKeyInputs).some((v) => v && v.trim());

  const handleNext = useCallback(async () => {
    // Auto-save API keys when leaving the apiKeys step
    if (currentStep === 'apiKeys' && hasApiKeysToSave) {
      await saveApiKeys();
    }
    nextStep();
  }, [currentStep, hasApiKeysToSave, nextStep, saveApiKeys]);

  const handleFinish = useCallback(() => {
    closeSetup();
  }, [closeSetup]);

  const handleClose = useCallback(() => {
    closeSetup();
  }, [closeSetup]);

  const stepInfo = stepConfig[currentStep];

  const renderStep = () => {
    switch (currentStep) {
      case 'apiKeys':
        return <ApiKeysSection />;
      case 'docker':
        return <DockerSection />;
      case 'skills':
        return <SkillsSection />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-v2-main flex flex-col animate-v2-overlay-backdrop">
      <div className="flex flex-col h-full animate-v2-overlay-content">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-v2-border bg-v2-surface shrink-0">
          <div className="flex items-center gap-3">
            {/* Gear icon */}
            <div className="p-2 bg-v2-accent/10 rounded-lg">
              <svg
                width="20" height="20" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                className="text-v2-accent"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-v2-text">Setup</h2>
              <p className="text-xs text-v2-text-muted">
                Step {currentStepIndex + 1} of {stepOrder.length} &mdash; {stepInfo.title}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            title="Close setup"
            className={cn(
              'p-2 rounded-v2-input',
              'text-v2-text-secondary hover:text-v2-text',
              'hover:bg-v2-sidebar-hover',
              'transition-colors duration-150'
            )}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Progress dots */}
        <div className="px-6 py-2 bg-v2-surface border-b border-v2-border" data-testid="progress-dots">
          <div className="flex items-center gap-2">
            {stepOrder.map((step, index) => {
              const isActive = index === currentStepIndex;
              const isComplete = index < currentStepIndex;
              return (
                <div key={step} className="flex-1" data-testid="progress-dot">
                  <div
                    className={cn(
                      'h-1.5 rounded-full transition-colors duration-200',
                      isComplete ? 'bg-v2-accent' :
                      isActive ? 'bg-v2-accent/50' :
                      'bg-v2-border'
                    )}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto v2-scrollbar">
          <div className="max-w-4xl mx-auto px-6 py-8">
            {renderStep()}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-v2-border bg-v2-surface shrink-0">
          <button
            onClick={isFirstStep ? handleClose : prevStep}
            className={cn(
              'flex items-center gap-2 text-sm px-3 py-2 rounded-v2-input',
              'text-v2-text-secondary hover:text-v2-text',
              'transition-colors duration-150'
            )}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 4l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {isFirstStep ? 'Cancel' : 'Back'}
          </button>

          {isLastStep ? (
            <button
              onClick={handleFinish}
              className={cn(
                'flex items-center gap-2 rounded-v2-input px-5 py-2.5 text-sm font-medium',
                'bg-green-600 text-white hover:bg-green-500',
                'transition-colors duration-150'
              )}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Finish
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={savingApiKeys}
              className={cn(
                'flex items-center gap-2 rounded-v2-input px-5 py-2.5 text-sm font-medium',
                'bg-v2-accent text-white hover:bg-v2-accent-hover',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'transition-colors duration-150'
              )}
            >
              {savingApiKeys ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Next
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
