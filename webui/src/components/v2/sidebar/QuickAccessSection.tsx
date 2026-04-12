import { useWorkspaceModalStore } from '../../../stores/v2/workspaceModalStore';
import { SidebarItem } from './SessionSection';

interface QuickAccessSectionProps {
  collapsed: boolean;
}

export function QuickAccessSection({ collapsed }: QuickAccessSectionProps) {
  const activeView = useWorkspaceModalStore((s) => s.activeView);
  const toggle = useWorkspaceModalStore((s) => s.toggle);

  return (
    <div className="py-1">
      {!collapsed && (
        <div className="flex items-center px-2 py-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-v2-text-muted">
            Workspace
          </span>
        </div>
      )}

      <div className="space-y-0.5">
        <SidebarItem
          collapsed={collapsed}
          icon={<FolderIcon />}
          label="Browse files"
          active={activeView === 'files'}
          onClick={() => toggle('files')}
        />
        <SidebarItem
          collapsed={collapsed}
          icon={<AnswerVoteIcon />}
          label="Answers / Votes"
          active={activeView === 'answers'}
          onClick={() => toggle('answers')}
        />
        <SidebarItem
          collapsed={collapsed}
          icon={<TimelineIcon />}
          label="Timeline"
          active={activeView === 'timeline'}
          onClick={() => toggle('timeline')}
        />
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4.5A1.5 1.5 0 013.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5V4.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AnswerVoteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-yellow-500/60">
      <path d="M8 1l2.1 4.2L15 6l-3.5 3.4.8 4.8L8 12l-4.3 2.2.8-4.8L1 6l4.9-.8L8 1z" />
    </svg>
  );
}

function TimelineIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 3v10M6 5v6M10 4v8M14 6v4" strokeLinecap="round" />
    </svg>
  );
}
