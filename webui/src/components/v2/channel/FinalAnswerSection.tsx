import { cn } from '../../../lib/utils';
import { useAgentStore, selectResolvedFinalAnswer } from '../../../stores/agentStore';

export function FinalAnswerSection() {
  const finalAnswer = useAgentStore(selectResolvedFinalAnswer);
  const selectedAgent = useAgentStore((s) => s.selectedAgent);
  const agents = useAgentStore((s) => s.agents);
  const voteDistribution = useAgentStore((s) => s.voteDistribution);
  const isComplete = useAgentStore((s) => s.isComplete);

  if (!isComplete || !finalAnswer || finalAnswer === '__PENDING__') return null;

  const winnerAgent = selectedAgent ? agents[selectedAgent] : null;
  const winnerName = winnerAgent?.modelName
    ? `${selectedAgent} (${winnerAgent.modelName})`
    : selectedAgent;

  return (
    <div className="px-4 py-4 animate-v2-fade-in">
      {/* Winner + vote header */}
      <div className={cn(
        'rounded-lg border border-yellow-500/20 bg-yellow-500/5 overflow-hidden'
      )}>
        {/* Header bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-yellow-500/10">
          <span className="text-yellow-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.1 6.3L22 9.3l-5 4.9 1.2 7L12 17.6 5.8 21.2 7 14.2 2 9.3l6.9-1L12 2z" />
            </svg>
          </span>
          <div>
            <h3 className="text-sm font-semibold text-v2-text">Final Answer</h3>
            {winnerName && (
              <p className="text-xs text-v2-text-muted">Winner: {winnerName}</p>
            )}
          </div>

          {/* Vote chips */}
          {Object.keys(voteDistribution).length > 0 && (
            <div className="flex gap-1.5 ml-auto">
              {Object.entries(voteDistribution)
                .sort(([, a], [, b]) => b - a)
                .map(([agentId, votes]) => {
                  const agent = agents[agentId];
                  const isWinner = agentId === selectedAgent;
                  return (
                    <span
                      key={agentId}
                      className={cn(
                        'text-[11px] px-2 py-0.5 rounded',
                        isWinner
                          ? 'bg-yellow-500/15 text-yellow-400 font-medium'
                          : 'bg-v2-surface text-v2-text-muted'
                      )}
                    >
                      {agent?.modelName || agentId}: {votes}
                    </span>
                  );
                })}
            </div>
          )}
        </div>

        {/* Answer content */}
        <div className="px-4 py-4 max-h-[60vh] overflow-y-auto v2-scrollbar">
          <pre className="whitespace-pre-wrap font-mono text-sm text-v2-text-secondary leading-relaxed">
            {finalAnswer}
          </pre>
        </div>
      </div>
    </div>
  );
}
