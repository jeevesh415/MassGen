import { cn } from '../../../lib/utils';
import { useThemeStore } from '../../../stores/themeStore';
import { useSetupStore } from '../../../stores/setupStore';

interface SidebarFooterProps {
  collapsed: boolean;
}

export function SidebarFooter({ collapsed }: SidebarFooterProps) {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const openSetup = useSetupStore((s) => s.openSetup);

  const toggleTheme = () => {
    const effectiveTheme = mode === 'system' ? 'dark' : mode;
    setMode(effectiveTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="border-t border-v2-border px-3 py-2 shrink-0">
      <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && (
          <button
            onClick={() => openSetup()}
            className="flex items-center gap-2 text-xs text-v2-text-muted hover:text-v2-text transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="6" />
              <path d="M8 5v3l2 1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Settings
          </button>
        )}

        <button
          onClick={toggleTheme}
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded',
            'text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover',
            'transition-colors duration-150'
          )}
          title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {mode === 'dark' || mode === 'system' ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="3" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 8.5A6 6 0 017.5 2 6 6 0 1014 8.5z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
