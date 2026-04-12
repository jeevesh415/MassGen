import { useEffect } from 'react';
import { cn } from '../../../lib/utils';
import { useAgentStore } from '../../../stores/agentStore';
import { useStatusStore } from '../../../stores/v2/statusStore';
import { getAgentColor } from '../../../utils/agentColors';

interface WorkspaceModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function WorkspaceModal({ title, onClose, children }: WorkspaceModalProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-v2-fade-in">
      {/* Scrim — click to close */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Modal panel — inset from edges */}
      <div
        className={cn(
          'relative flex flex-col',
          'w-[calc(100%-64px)] h-[calc(100%-64px)]',
          'max-w-[1600px]',
          'bg-v2-main rounded-xl border border-v2-border shadow-2xl',
          'overflow-hidden'
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 bg-v2-surface border-b border-v2-border shrink-0 rounded-t-xl">
          <span className="text-sm font-medium text-v2-text">{title}</span>
          <div className="flex-1" />
          <span className="text-[10px] text-v2-text-muted/50 mr-2">ESC</span>
          <button
            onClick={onClose}
            className={cn(
              'flex items-center justify-center w-7 h-7 rounded',
              'text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover',
              'transition-colors duration-150'
            )}
            title="Close (Esc)"
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>

        {/* Live status footer — shows agent progress while modal is open */}
        <ModalStatusFooter />
      </div>
    </div>
  );
}

// ============================================================================
// Compact status footer showing live run progress
// ============================================================================

function ModalStatusFooter() {
  const agents = useAgentStore((s) => s.agents);
  const agentOrder = useAgentStore((s) => s.agentOrder);
  const isComplete = useAgentStore((s) => s.isComplete);
  const phase = useStatusStore((s) => s.phase);

  if (agentOrder.length === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-v2-surface border-t border-v2-border shrink-0 rounded-b-xl">
      {/* Phase */}
      {phase && !isComplete && (
        <span className="text-[10px] text-v2-text-muted uppercase tracking-wider font-medium">
          {phase.replace(/_/g, ' ')}
        </span>
      )}
      {isComplete && (
        <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-medium">
          Complete
        </span>
      )}

      <div className="flex-1" />

      {/* Agent status dots */}
      <div className="flex items-center gap-2">
        {agentOrder.map((agentId) => {
          const agent = agents[agentId];
          if (!agent) return null;
          const color = getAgentColor(agentId, agentOrder);
          const isWorking = agent.status === 'working' || agent.status === 'voting';
          const isDone = agent.status === 'completed';

          return (
            <div key={agentId} className="flex items-center gap-1" title={`${agentId}: ${agent.status}`}>
              <span
                className={cn('w-1.5 h-1.5 rounded-full', isWorking && 'animate-pulse')}
                style={{ backgroundColor: isDone ? `${color.hex}60` : color.hex }}
              />
              <span className="text-[10px] text-v2-text-muted">
                {agentId.replace(/_/g, ' ')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
