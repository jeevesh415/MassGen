import { cn } from '../../../lib/utils';
import { useMessageStore } from '../../../stores/v2/messageStore';

const PHASE_CONFIG: Record<string, { label: string; color: string; hide?: boolean }> = {
  // Orchestrator phases
  idle: { label: 'Idle', color: 'bg-v2-offline', hide: true },
  coordinating: { label: 'Coordinating', color: 'bg-blue-500' },
  presenting: { label: 'Presenting', color: 'bg-v2-online' },
  // Legacy/TUI phases
  initial_answer: { label: 'Working', color: 'bg-blue-500' },
  voting: { label: 'Voting', color: 'bg-v2-idle' },
  consensus: { label: 'Consensus', color: 'bg-purple-500' },
};

export function ModeBar() {
  const currentPhase = useMessageStore((s) => s.currentPhase);
  const currentRound = useMessageStore((s) => s.currentRound);
  const allMessages = useMessageStore((s) => s.messages);

  if (!currentPhase) return null;

  const config = PHASE_CONFIG[currentPhase] || { label: currentPhase, color: 'bg-v2-offline' };
  if (config.hide) return null;

  // Compute max round across all agents
  const maxRound = Math.max(0, ...Object.values(currentRound));

  // Count total answers across all agents
  let totalAnswers = 0;
  for (const messages of Object.values(allMessages)) {
    for (const msg of messages) {
      if (msg.type === 'answer') totalAnswers++;
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-v2-border-subtle bg-v2-surface/50 shrink-0">
      <span className={cn('w-1.5 h-1.5 rounded-full', config.color)} />
      <span className="text-[11px] uppercase tracking-wider text-v2-text-muted font-medium">
        {config.label}
      </span>

      {maxRound > 0 && (
        <>
          <span className="text-v2-text-muted/30">|</span>
          <span className="text-[11px] text-v2-text-muted">
            Round {maxRound}
          </span>
        </>
      )}

      {totalAnswers > 0 && (
        <>
          <span className="text-v2-text-muted/30">|</span>
          <span className="text-[11px] text-v2-text-muted">
            {totalAnswers} answer{totalAnswers !== 1 ? 's' : ''}
          </span>
        </>
      )}
    </div>
  );
}
