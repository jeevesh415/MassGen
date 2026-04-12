/**
 * GuideTip — Inline guided tip for skill onboarding.
 *
 * Renders a callout box with a dismiss button inside wizard steps.
 * Only visible when onboarding is active and the tip hasn't been dismissed.
 */

import { cn } from '../../../lib/utils';
import { useOnboardingStore } from '../../../stores/v2/onboardingStore';

interface GuideTipProps {
  tipId: string;
  title: string;
  body: string;
  variant?: 'info' | 'important';
  className?: string;
}

export function GuideTip({ tipId, title, body, variant = 'info', className }: GuideTipProps) {
  const isOnboardingActive = useOnboardingStore((s) => s.isOnboardingActive);
  const dismissedTips = useOnboardingStore((s) => s.dismissedTips);
  const dismissTip = useOnboardingStore((s) => s.dismissTip);

  if (!isOnboardingActive || dismissedTips.has(tipId)) return null;

  return (
    <div
      className={cn(
        'rounded-lg border-l-4 px-4 py-3 my-3 animate-v2-fade-in',
        variant === 'important'
          ? 'border-l-amber-500 bg-amber-500/5'
          : 'border-l-v2-accent bg-v2-accent/5',
        className,
      )}
      data-testid={`guide-tip-${tipId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn(
            'text-sm font-medium',
            variant === 'important' ? 'text-amber-300' : 'text-v2-accent',
          )}>
            {title}
          </p>
          <p className="mt-1 text-sm text-v2-text-secondary">{body}</p>
        </div>
        <button
          onClick={() => dismissTip(tipId)}
          className="shrink-0 text-xs text-v2-text-muted hover:text-v2-text-secondary transition-colors"
          aria-label="Dismiss tip"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
