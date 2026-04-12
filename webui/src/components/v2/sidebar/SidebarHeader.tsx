import { cn } from '../../../lib/utils';

interface SidebarHeaderProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function SidebarHeader({ collapsed, onToggleCollapse }: SidebarHeaderProps) {
  return (
    <div className="flex items-center h-12 px-3 border-b border-v2-border shrink-0">
      {!collapsed && (
        <h1 className="text-sm font-semibold text-v2-text truncate flex-1">
          MassGen
        </h1>
      )}
      <button
        onClick={onToggleCollapse}
        className={cn(
          'flex items-center justify-center w-7 h-7 rounded',
          'text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover',
          'transition-colors duration-150',
          collapsed && 'mx-auto'
        )}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className={cn('transition-transform duration-200', collapsed && 'rotate-180')}
        >
          <path
            d="M10 12L6 8L10 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
