import { useState, useEffect, useRef } from 'react';
import { cn } from '../../../lib/utils';
import { useAgentStore } from '../../../stores/agentStore';
import { useMessageStore } from '../../../stores/v2/messageStore';

interface LaunchIndicatorProps {
  configName?: string;
}

const STEP_LABELS: Record<string, string> = {
  request: 'Submitting prompt',
  config: 'Loading configuration',
  agents: 'Setting up agents',
  agents_ready: 'Agents initialized',
  orchestrator: 'Preparing orchestrator',
  starting: 'Starting coordination',
};

const STEP_DETAILS: Record<string, string> = {
  request: 'Sending your question to the coordination backend',
  config: 'Loading and validating the selected config',
  agents: 'Creating agents, backends, and tool connections',
  agents_ready: 'Agent sessions are initialized and ready',
  orchestrator: 'Wiring up the coordination workflow',
  starting: 'Handing the task off to the agents',
};

const STEP_ORDER = ['request', 'config', 'agents', 'agents_ready', 'orchestrator', 'starting'];

const THINKING_TIPS = [
  'The model is reading the prompt and planning its first move.',
  'First responses can take a bit while the model reasons through the task.',
  'If tools are available, the agent may decide whether it needs them before answering.',
  'A slower first response usually means the model is still thinking, not that the run is stuck.',
];

export function LaunchIndicator({ configName }: LaunchIndicatorProps) {
  const question = useAgentStore((s) => s.question);
  const initStatus = useAgentStore((s) => s.initStatus);
  const preparationStatus = useAgentStore((s) => s.preparationStatus);
  const preparationDetail = useAgentStore((s) => s.preparationDetail);
  const agentOrder = useAgentStore((s) => s.agentOrder);
  const agents = useAgentStore((s) => s.agents);
  const messages = useMessageStore((s) => s.messages);

  const hasRenderableActivity = Object.values(messages).some((agentMessages) =>
    agentMessages.some((message) => message.type !== 'round-divider')
  );
  const isWaitingForFirstResponse = agentOrder.length > 0 && !hasRenderableActivity;
  const workingAgents = agentOrder.filter((agentId) => agents[agentId]?.status === 'working');
  const thinkingLabel = workingAgents.length <= 1
    ? 'Model is thinking...'
    : `${workingAgents.length} models are thinking...`;
  const [tipIndex, setTipIndex] = useState(0);

  const rawProgress = initStatus?.progress ?? (isWaitingForFirstResponse ? 100 : 3);
  const currentStep = initStatus?.step || (isWaitingForFirstResponse ? 'starting' : 'request');

  // High watermark — progress bar never goes backward
  const progressRef = useRef(0);
  progressRef.current = Math.max(progressRef.current, rawProgress);
  const progress = progressRef.current;
  const activeStepIndex = STEP_ORDER.indexOf(currentStep);
  const activityLabel = preparationStatus
    || initStatus?.message
    || (isWaitingForFirstResponse ? thinkingLabel : 'Starting coordination...');
  const activityDetail = preparationDetail
    || (isWaitingForFirstResponse ? THINKING_TIPS[tipIndex] : STEP_DETAILS[currentStep] || STEP_DETAILS.request);

  // Track completed steps for the checklist
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const prevStepRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentStep && currentStep !== prevStepRef.current) {
      // Mark the previous step as completed
      if (prevStepRef.current && !completedSteps.includes(prevStepRef.current)) {
        setCompletedSteps((prev) => [...prev, prevStepRef.current!]);
      }
      prevStepRef.current = currentStep;
    }
  }, [currentStep, completedSteps]);

  // When agents start working, mark all steps including "starting" as completed
  useEffect(() => {
    if (isWaitingForFirstResponse && !completedSteps.includes('starting')) {
      setCompletedSteps(STEP_ORDER.slice());
    }
  }, [isWaitingForFirstResponse, completedSteps]);

  useEffect(() => {
    if (!isWaitingForFirstResponse || preparationDetail) {
      setTipIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setTipIndex((prev) => (prev + 1) % THINKING_TIPS.length);
    }, 2400);

    return () => window.clearInterval(timer);
  }, [isWaitingForFirstResponse, preparationDetail]);

  return (
    <div className="flex-1 flex items-center justify-center relative">
      {/* Ambient glow */}
      <div className="absolute inset-0 v2-launch-glow" />

      <div className="w-full max-w-md px-8 relative z-10 animate-v2-welcome-fade-in">
        <div className="flex flex-col items-center gap-6">
          {/* Question echo */}
          {question && (
            <div className="text-center space-y-1">
              <p className="text-lg font-medium text-v2-text leading-snug">
                &ldquo;{question.length > 80 ? question.slice(0, 80) + '...' : question}&rdquo;
              </p>
              {configName && (
                <p className="text-xs text-v2-text-muted">
                  Config: {configName}
                </p>
              )}
            </div>
          )}

          {/* Progress bar with shimmer */}
          <div className="w-full bg-v2-surface rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-v2-accent to-purple-500 transition-all duration-500 ease-out relative"
              style={{ width: `${Math.max(progress, 5)}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-v2-shimmer" />
            </div>
          </div>

          <div className="w-full rounded-v2-card border border-v2-border bg-v2-surface-raised/80 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-v2-text-muted">
              Current Activity
            </div>
            <div
              data-testid="launch-activity-label"
              className="mt-2 text-sm font-medium text-v2-text"
            >
              {activityLabel}
            </div>
            <div
              data-testid="launch-activity-detail"
              className="mt-1 text-xs text-v2-text-muted"
            >
              {activityDetail}
            </div>
          </div>

          {/* Step checklist */}
          <div className="w-full space-y-1.5">
            {STEP_ORDER.map((step, index) => {
              const isCompleted = completedSteps.includes(step);
              const isActive = currentStep === step && !isCompleted;
              const isPending = !isCompleted && !isActive;
              const isNextPending = isPending && index === activeStepIndex + 1;
              const label = STEP_LABELS[step] || step;

              // Only render visible rows so skipped pending steps do not leave blank gaps.
              if (!isCompleted && !isActive && !isNextPending) {
                return null;
              }

              return (
                <div
                  key={step}
                  className={cn(
                    'flex items-center gap-2.5 text-sm px-2 py-1 rounded',
                    isActive && 'opacity-0 animate-v2-stagger-fade-in',
                    isPending && 'opacity-60',
                    isCompleted && 'opacity-0 animate-v2-stagger-fade-in'
                  )}
                  style={
                    (isActive || isCompleted)
                      ? { animationDelay: `${index * 80}ms`, animationFillMode: 'forwards' }
                      : undefined
                  }
                >
                  {/* Status icon */}
                  {isCompleted ? (
                    <svg className="w-4 h-4 text-v2-online shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 8l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : isActive ? (
                    <svg className="w-4 h-4 text-v2-accent animate-spin shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="8" cy="8" r="6" strokeDasharray="20" strokeDashoffset="5" />
                    </svg>
                  ) : (
                    <div className="w-4 h-4 shrink-0" />
                  )}

                  {/* Label */}
                  <span className={cn(
                    isCompleted && 'text-v2-text-muted',
                    isActive && 'text-v2-text',
                    isPending && 'text-v2-text-muted/40'
                  )}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
