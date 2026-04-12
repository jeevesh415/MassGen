/**
 * WelcomeStep — First step shown during skill-triggered onboarding.
 *
 * Introduces MassGen, explains what's about to be configured,
 * and gives the user context before they proceed.
 */

import { cn } from '../../lib/utils';

export function WelcomeStep() {
  return (
    <div className="flex flex-col items-center text-center max-w-2xl mx-auto py-4">
      {/* Logo / branding */}
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-v2-accent/10">
        <svg
          width="28" height="28" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
          className="text-v2-accent"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>

      <h2 className="text-xl font-bold text-v2-text">Welcome to MassGen</h2>

      <p className="mt-2 text-sm text-v2-text-secondary leading-relaxed">
        MassGen coordinates multiple AI agents to solve tasks through parallel
        iteration and consensus. Let&apos;s set up which AI models your team will use.
      </p>

      {/* What you'll configure */}
      <div className="mt-5 w-full">
        <div className="grid grid-cols-3 gap-3">
          <StepPreview
            number={1}
            title="API Keys"
            description="Connect providers"
          />
          <StepPreview
            number={2}
            title="Models"
            description="Pick models"
          />
          <StepPreview
            number={3}
            title="Team Size"
            description="How many agents"
          />
        </div>
      </div>

      <p className="mt-5 text-xs text-v2-text-muted">
        This only takes a minute. Your config is saved locally and reused for all future runs.
      </p>
    </div>
  );
}

function StepPreview({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className={cn(
      'flex flex-col items-center rounded-lg border border-v2-border bg-v2-surface px-3 py-3',
    )}>
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-v2-accent/10 text-xs font-semibold text-v2-accent">
        {number}
      </div>
      <p className="mt-1.5 text-sm font-medium text-v2-text">{title}</p>
      <p className="mt-0.5 text-xs text-v2-text-muted">{description}</p>
    </div>
  );
}
