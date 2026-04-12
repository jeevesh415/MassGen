/**
 * V2 Quickstart Wizard Overlay
 *
 * Full-screen overlay for guided config setup.
 * Reuses existing wizard step components and the wizardStore for all state.
 */

import { useCallback, useEffect, useState } from 'react';
import { cn } from '../../../lib/utils';
import { useWizardStore, WizardStep } from '../../../stores/wizardStore';
import { useThemeStore } from '../../../stores/themeStore';
import type { ThemeMode } from '../../../stores/themeStore';
import {
  DockerStep,
  ApiKeyStep,
  AgentCountStep,
  SetupModeStep,
  AgentConfigStep,
  SkillsStep,
  PreviewStep,
  WelcomeStep,
} from '../../wizard';

const THEME_CYCLE: ThemeMode[] = ['dark', 'light', 'system'];

function ThemeToggle() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  const next = () => {
    const idx = THEME_CYCLE.indexOf(mode);
    setMode(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  return (
    <button
      type="button"
      onClick={next}
      title={`Theme: ${mode}`}
      className={cn(
        'p-2 rounded-v2-input',
        'text-v2-text-secondary hover:text-v2-text',
        'hover:bg-v2-sidebar-hover',
        'transition-colors duration-150',
      )}
    >
      {mode === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : mode === 'light' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      )}
    </button>
  );
}

const stepConfig: Record<WizardStep, { title: string }> = {
  welcome: { title: 'Welcome' },
  docker: { title: 'Execution Mode' },
  apiKeys: { title: 'API Keys' },
  agentCount: { title: 'Number of Agents' },
  setupMode: { title: 'Setup Mode' },
  agentConfig: { title: 'Agent Configuration' },
  coordination: { title: 'Coordination Settings' }, // kept for type safety, not shown
  skills: { title: 'Skills' },
  preview: { title: 'Review & Save' },
};

interface V2QuickstartWizardProps {
  onConfigSaved?: (configPath: string) => void;
  temporaryMode?: boolean;
}

export function V2QuickstartWizard({ onConfigSaved, temporaryMode = false }: V2QuickstartWizardProps) {
  const isOpen = useWizardStore((s) => s.isOpen);
  const currentStep = useWizardStore((s) => s.currentStep);
  const isLoading = useWizardStore((s) => s.isLoading);
  const agents = useWizardStore((s) => s.agents);
  const agentCount = useWizardStore((s) => s.agentCount);
  const providers = useWizardStore((s) => s.providers);

  const skillOnboarding = useWizardStore((s) => s.skillOnboarding);
  const closeWizard = useWizardStore((s) => s.closeWizard);
  const setStep = useWizardStore((s) => s.setStep);
  const nextStep = useWizardStore((s) => s.nextStep);
  const prevStep = useWizardStore((s) => s.prevStep);
  const saveConfig = useWizardStore((s) => s.saveConfig);
  const reset = useWizardStore((s) => s.reset);

  const [temporarySessionState, setTemporarySessionState] = useState<'idle' | 'completed' | 'cancelled'>('idle');
  const [temporarySessionPending, setTemporarySessionPending] = useState(false);
  const [temporarySessionError, setTemporarySessionError] = useState<string | null>(null);
  const [savedConfigPath, setSavedConfigPath] = useState<string | null>(null);

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
            body: status === 'completed'
              ? JSON.stringify({ config_path: configPath ?? null })
              : undefined,
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `Failed to ${status === 'completed' ? 'finish' : 'cancel'} session`,
          );
        }

        if (status === 'completed' && configPath && onConfigSaved) {
          onConfigSaved(configPath);
        }

        setSavedConfigPath(configPath ?? null);
        setTemporarySessionState(status);
      } catch (err) {
        setTemporarySessionError(err instanceof Error ? err.message : 'Unexpected error');
      } finally {
        setTemporarySessionPending(false);
      }
    },
    [onConfigSaved],
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
      const configPath = useWizardStore.getState().savedConfigPath;

      if (temporaryMode) {
        await finalizeTemporarySession('completed', configPath);
        return;
      }

      if (configPath && onConfigSaved) {
        onConfigSaved(configPath);
      }

      closeWizard();
      reset();
    }
  }, [closeWizard, finalizeTemporarySession, onConfigSaved, reset, saveConfig, temporaryMode]);

  // Compute visible steps (skip steps that don't apply)
  const allSteps: WizardStep[] = skillOnboarding
    ? ['welcome', 'apiKeys', 'docker', 'agentCount', 'setupMode', 'agentConfig', 'skills', 'preview']
    : ['apiKeys', 'docker', 'agentCount', 'setupMode', 'agentConfig', 'skills', 'preview'];

  const visibleSteps = allSteps.filter((step) => {
    // Always show apiKeys — users should be able to manage keys even if some are set
    if (step === 'setupMode' && agentCount === 1) return false;
    return true;
  });

  const currentStepIndex = visibleSteps.indexOf(currentStep);

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 'welcome':
        return true;
      case 'docker':
        return true;
      case 'apiKeys':
        return providers.some((p) => p.has_api_key);
      case 'agentCount':
        return agentCount >= 1 && agentCount <= 5;
      case 'setupMode':
        return true;
      case 'agentConfig':
        return agents.every((agent) => agent.provider && agent.model);
      case 'skills':
        return true;
      case 'preview':
        return true;
      default:
        return false;
    }
  }, [currentStep, agentCount, agents, providers]);

  // Enter key advances the wizard (unless user is in an input/textarea/select)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (!canProceed() || isLoading || temporarySessionPending) return;
      if (currentStep === 'preview') {
        void handleSave();
      } else {
        nextStep();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canProceed, currentStep, handleSave, isLoading, nextStep, temporarySessionPending]);

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome': return <WelcomeStep />;
      case 'docker': return <DockerStep />;
      case 'apiKeys': return <ApiKeyStep />;
      case 'agentCount': return <AgentCountStep />;
      case 'setupMode': return <SetupModeStep />;
      case 'agentConfig': return <AgentConfigStep />;
      case 'skills': return <SkillsStep />;
      case 'preview': return <PreviewStep />;
      default: return null;
    }
  };

  if (!isOpen) return null;

  const stepInfo = stepConfig[currentStep];
  const isFirstStep = currentStep === visibleSteps[0];
  const isLastStep = currentStep === 'preview';
  const showTemporaryResult = temporarySessionState !== 'idle';

  return (
    <div className="fixed inset-0 z-50 bg-v2-main flex flex-col animate-v2-overlay-backdrop">
      <div className="flex flex-col h-full animate-v2-overlay-content">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-v2-border bg-v2-surface shrink-0">
          <div className="flex items-center gap-3">
            {/* Wand icon */}
            <div className="p-2 bg-v2-accent/10 rounded-lg">
              <svg
                width="20" height="20" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                className="text-v2-accent"
              >
                <path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" />
                <path d="M20 9h2" /><path d="M17.8 11.8L19 13" />
                <path d="M15 9h0" /><path d="M17.8 6.2L19 5" />
                <path d="M3 21l9-9" /><path d="M12.2 6.2L11 5" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-v2-text">
                {showTemporaryResult ? 'Setup Complete' : skillOnboarding ? 'MassGen Setup' : 'Quickstart Setup'}
              </h2>
              <p className="text-xs text-v2-text-muted">
                {showTemporaryResult
                  ? 'Temporary session'
                  : `Step ${currentStepIndex + 1} of ${visibleSteps.length} \u2014 ${stepInfo.title}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Theme toggle */}
            <ThemeToggle />

            <button
              onClick={handleClose}
              disabled={isLoading || temporarySessionPending}
              title="Close wizard"
              className={cn(
                'p-2 rounded-v2-input',
                'text-v2-text-secondary hover:text-v2-text',
                'hover:bg-v2-sidebar-hover',
                'transition-colors duration-150',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Progress bar with step labels */}
        {!showTemporaryResult && (
          <div className="px-6 py-3 bg-v2-surface border-b border-v2-border" data-testid="progress-dots">
            <div className="flex items-center gap-1.5">
              {visibleSteps.map((step, index) => {
                const isActive = index === currentStepIndex;
                const isComplete = index < currentStepIndex;
                return (
                  <button
                    key={step}
                    type="button"
                    disabled={!isComplete}
                    onClick={() => isComplete && setStep(step)}
                    className={cn(
                      'flex-1 flex flex-col items-center gap-1',
                      isComplete && 'cursor-pointer group',
                    )}
                    data-testid="progress-dot"
                  >
                    <div
                      className={cn(
                        'w-full h-1.5 rounded-full transition-all duration-200',
                        isComplete ? 'bg-v2-accent group-hover:bg-v2-accent-hover' :
                        isActive ? 'bg-v2-accent animate-pulse' :
                        'bg-v2-border'
                      )}
                    />
                    <span className={cn(
                      'text-[10px] leading-tight truncate max-w-full',
                      isActive ? 'text-v2-accent font-medium' :
                      isComplete ? 'text-v2-text-secondary group-hover:text-v2-accent' :
                      'text-v2-text-muted'
                    )}>
                      {stepConfig[step].title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto v2-scrollbar flex flex-col">
          <div className="flex-1 flex flex-col max-w-6xl w-full mx-auto px-8 py-4">
            {showTemporaryResult ? (
              <div className="flex flex-col items-center text-center py-12">
                <div className={cn(
                  'mb-5 flex h-16 w-16 items-center justify-center rounded-full',
                  temporarySessionState === 'completed'
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-amber-500/10 text-amber-400'
                )}>
                  {temporarySessionState === 'completed' ? (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
                    </svg>
                  )}
                </div>
                <h3 className="text-xl font-semibold text-v2-text">
                  {temporarySessionState === 'completed' ? 'Setup Complete!' : 'Setup Cancelled'}
                </h3>
                <p className="mt-3 text-base text-v2-text-secondary">
                  {temporarySessionState === 'completed'
                    ? 'Close this tab and return to your agent.'
                    : 'The session has been cancelled. You can close this tab.'}
                </p>
                {temporarySessionState === 'completed' && (
                  <p className="mt-2 text-sm text-v2-text-muted">
                    Your agent will automatically detect the new config and continue.
                  </p>
                )}
                {savedConfigPath && temporarySessionState === 'completed' && (
                  <div className="mt-5 w-full max-w-md rounded-lg border border-v2-border bg-v2-surface px-4 py-3 text-left">
                    <div className="text-xs font-medium uppercase tracking-wide text-v2-text-muted">
                      Saved Config
                    </div>
                    <code className="mt-1 block break-all text-sm text-v2-text">
                      {savedConfigPath}
                    </code>
                  </div>
                )}
                {temporarySessionError && (
                  <div className="mt-4 w-full max-w-md rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                    {temporarySessionError}
                  </div>
                )}
              </div>
            ) : (
              renderStep()
            )}
          </div>
        </div>

        {/* Footer */}
        {!showTemporaryResult && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-v2-border bg-v2-surface shrink-0">
            <button
              onClick={isFirstStep ? handleClose : prevStep}
              disabled={isLoading || temporarySessionPending}
              className={cn(
                'flex items-center gap-2 text-sm px-3 py-2 rounded-v2-input',
                'text-v2-text-secondary hover:text-v2-text',
                'transition-colors duration-150',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M10 4l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {isFirstStep ? 'Cancel' : 'Back'}
            </button>

            {isLastStep ? (
              <button
                onClick={handleSave}
                disabled={isLoading || temporarySessionPending || !canProceed()}
                className={cn(
                  'flex items-center gap-2 rounded-v2-input px-5 py-2.5 text-sm font-medium',
                  'bg-green-600 text-white hover:bg-green-500',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'transition-colors duration-150'
                )}
              >
                {isLoading || temporarySessionPending ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    {temporaryMode ? 'Finishing...' : 'Saving...'}
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M15 9h0M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {temporaryMode ? 'Save & Finish' : 'Save & Start'}
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={nextStep}
                disabled={!canProceed() || temporarySessionPending}
                className={cn(
                  'flex items-center gap-2 rounded-v2-input px-5 py-2.5 text-sm font-medium',
                  'bg-v2-accent text-white hover:bg-v2-accent-hover',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  'transition-colors duration-150'
                )}
              >
                Next
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
