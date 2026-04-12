/**
 * StepIntro — Banner at the top of a wizard step during onboarding.
 *
 * Provides context about what the current step does and why it matters.
 * Only visible during guided onboarding.
 */

import { cn } from '../../../lib/utils';
import { useOnboardingStore } from '../../../stores/v2/onboardingStore';

interface StepIntroProps {
  title: string;
  description: string;
  className?: string;
}

export function StepIntro({ title, description, className }: StepIntroProps) {
  const isOnboardingActive = useOnboardingStore((s) => s.isOnboardingActive);

  if (!isOnboardingActive) return null;

  return (
    <div
      className={cn(
        'rounded-lg border border-v2-border bg-v2-surface px-5 py-4 mb-6 animate-v2-fade-in',
        className,
      )}
      data-testid="step-intro"
    >
      <h3 className="text-base font-semibold text-v2-text">{title}</h3>
      <p className="mt-1 text-sm text-v2-text-secondary">{description}</p>
    </div>
  );
}
