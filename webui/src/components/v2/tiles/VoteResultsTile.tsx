import { Trophy, Vote } from 'lucide-react';
import { useAgentStore, selectVoteDistribution, selectSelectedAgent, selectAgentOrder } from '../../../stores/agentStore';
import { getAgentColor } from '../../../utils/agentColors';

export function VoteResultsTile() {
  const voteDistribution = useAgentStore(selectVoteDistribution);
  const selectedAgent = useAgentStore(selectSelectedAgent);
  const agentOrder = useAgentStore(selectAgentOrder);

  const maxVotes = Math.max(...Object.values(voteDistribution), 1);
  const totalVotes = Object.values(voteDistribution).reduce((a, b) => a + b, 0);

  const sortedAgents = [...agentOrder].sort(
    (a, b) => (voteDistribution[b] || 0) - (voteDistribution[a] || 0)
  );

  if (totalVotes === 0) {
    return (
      <div className="h-full overflow-auto v2-scrollbar p-4 bg-v2-base">
        <div className="rounded-lg p-4 bg-v2-surface border border-v2-border">
          <div className="flex items-center gap-2 text-v2-text-muted mb-4">
            <Vote className="w-5 h-5" />
            <h3 className="font-medium">Vote Distribution</h3>
          </div>
          <div className="text-v2-text-muted text-sm text-center py-4 italic">
            No votes recorded yet
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto v2-scrollbar p-4 bg-v2-base">
      <div className="rounded-lg p-4 bg-v2-surface border border-v2-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-v2-text">
            <Vote className="w-5 h-5" />
            <h3 className="font-medium">Vote Distribution</h3>
          </div>
          <span className="text-sm text-v2-text-muted">Total: {totalVotes}</span>
        </div>

        <div className="space-y-3">
          {sortedAgents.map((agentId) => {
            const votes = voteDistribution[agentId] || 0;
            const percentage = (votes / maxVotes) * 100;
            const isWinner = selectedAgent === agentId;
            const color = getAgentColor(agentId, agentOrder);

            return (
              <div key={agentId} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: color.hex }}
                    />
                    <span
                      className={isWinner ? 'font-medium' : 'text-v2-text-secondary'}
                      style={isWinner ? { color: color.hexLight } : undefined}
                    >
                      {agentId}
                    </span>
                    {isWinner && <Trophy className="w-4 h-4 text-amber-400" />}
                  </div>
                  <span className={isWinner ? 'text-v2-text font-medium' : 'text-v2-text-muted'}>
                    {votes} vote{votes !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Vote Bar */}
                <div className="h-3 rounded-full overflow-hidden bg-v2-base">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: isWinner ? color.hex : `${color.hex}99`,
                      boxShadow: isWinner ? `0 0 8px ${color.hex}66` : undefined,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
