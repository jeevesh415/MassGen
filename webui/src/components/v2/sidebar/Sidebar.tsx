import { cn } from '../../../lib/utils';
import { SidebarHeader } from './SidebarHeader';
import { SessionSection } from './SessionSection';
import { PreCollabSection } from './PreCollabSection';
import { ChannelSection } from './ChannelSection';
import { ThreadSection } from './ThreadSection';
import { ActivitySection } from './ActivitySection';
import { QuickAccessSection } from './QuickAccessSection';
import { SidebarFooter } from './SidebarFooter';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSessionChange?: (sessionId: string) => void;
  onNewSession?: () => void;
  onConfigChange?: (configPath: string) => void;
}

export function Sidebar({ collapsed, onToggleCollapse, onSessionChange, onNewSession, onConfigChange }: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-v2-sidebar border-r border-v2-border',
        'transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-v2-sidebar-collapsed' : 'w-v2-sidebar'
      )}
    >
      <SidebarHeader collapsed={collapsed} onToggleCollapse={onToggleCollapse} />

      <div className="flex-1 overflow-y-auto v2-scrollbar px-2 py-1">
        {/* Pre-collab phases (above channels, only shown when active) */}
        <PreCollabSection collapsed={collapsed} />
        {/* Active run content */}
        <ChannelSection collapsed={collapsed} />
        <SidebarDivider />
        <ThreadSection collapsed={collapsed} />
        <SidebarDivider />
        <ActivitySection collapsed={collapsed} />
        <SidebarDivider />
        <QuickAccessSection collapsed={collapsed} />
        <SidebarDivider />
        {/* Sessions below — secondary during active runs */}
        <SessionSection collapsed={collapsed} onSessionChange={onSessionChange} onNewSession={onNewSession} onConfigChange={onConfigChange} />
      </div>

      <SidebarFooter collapsed={collapsed} />
    </aside>
  );
}

function SidebarDivider() {
  return (
    <div className="mx-2 my-1">
      <div className="h-px bg-v2-border" />
    </div>
  );
}
