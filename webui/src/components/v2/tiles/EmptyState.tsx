import { cn } from '../../../lib/utils';

interface EmptyStateProps {
  onOpenWizard?: () => void;
  hasConfigs?: boolean;
}

export function EmptyState({ onOpenWizard, hasConfigs = true }: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center h-full text-v2-text-muted">
      <div className="text-center space-y-4 animate-v2-welcome-fade-in">
        {/* Branding */}
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          MassGen
        </h1>

        {!hasConfigs ? (
          <>
            <p className="text-sm text-v2-text-secondary">
              No configurations yet
            </p>
            {onOpenWizard && (
              <button
                onClick={onOpenWizard}
                className={cn(
                  'mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-v2-input text-sm font-medium',
                  'bg-v2-accent text-white hover:bg-v2-accent-hover',
                  'transition-colors duration-150'
                )}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                </svg>
                Create your first config
              </button>
            )}
          </>
        ) : (
          <>
            {/* Guiding copy */}
            <p className="text-sm text-v2-text-secondary">
              Ready when you are
            </p>
            <p className="text-xs text-v2-text-muted">
              Choose a config and enter your question below
            </p>

            {/* Bouncing chevron */}
            <div className="pt-4 animate-v2-chevron-bounce">
              <svg
                className="w-5 h-5 mx-auto text-v2-accent/40"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
