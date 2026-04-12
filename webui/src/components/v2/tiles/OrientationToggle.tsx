import { cn } from '../../../lib/utils';
import { useTileStore } from '../../../stores/v2/tileStore';

export function OrientationToggle() {
  const orientation = useTileStore((s) => s.orientation);
  const toggleOrientation = useTileStore((s) => s.toggleOrientation);

  return (
    <button
      onClick={toggleOrientation}
      className={cn(
        'absolute top-2 right-2 z-10',
        'flex items-center justify-center w-6 h-6 rounded',
        'bg-v2-surface-raised border border-v2-border',
        'text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover',
        'transition-colors duration-150',
        'opacity-60 hover:opacity-100'
      )}
      title="Toggle layout orientation"
    >
      {orientation === 'horizontal' ? (
        // Columns icon (horizontal layout)
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="2" width="5" height="12" rx="1" />
          <rect x="9" y="2" width="5" height="12" rx="1" />
        </svg>
      ) : (
        // Rows icon (vertical layout)
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="2" width="12" height="5" rx="1" />
          <rect x="2" y="9" width="12" height="5" rx="1" />
        </svg>
      )}
    </button>
  );
}
