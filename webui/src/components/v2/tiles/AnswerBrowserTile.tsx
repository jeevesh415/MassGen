import { useState } from 'react';
import { cn } from '../../../lib/utils';
import { useAgentStore, selectVoteDistribution, selectSelectedAgent, selectAgentOrder } from '../../../stores/agentStore';
import { useMessageStore, type AnswerMessage } from '../../../stores/v2/messageStore';
import { useTileStore } from '../../../stores/v2/tileStore';
import { getAgentColor } from '../../../utils/agentColors';

type Tab = 'answers' | 'votes';

interface AnswerBrowserTileProps {
  focusAnswerLabel?: string;
}

export function AnswerBrowserTile({ focusAnswerLabel }: AnswerBrowserTileProps) {
  const [activeTab, setActiveTab] = useState<Tab>(focusAnswerLabel ? 'answers' : 'answers');

  return (
    <div className="flex flex-col h-full bg-v2-base">
      {/* Tab bar */}
      <div className="flex items-center border-b border-v2-border shrink-0 bg-v2-surface/50">
        <TabButton active={activeTab === 'answers'} onClick={() => setActiveTab('answers')}>
          Answers
        </TabButton>
        <TabButton active={activeTab === 'votes'} onClick={() => setActiveTab('votes')}>
          Votes
        </TabButton>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'answers' && <AnswersPanel focusAnswerLabel={focusAnswerLabel} />}
        {activeTab === 'votes' && <VotesPanel />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2 text-xs font-medium transition-colors duration-150',
        active
          ? 'text-v2-text border-b-2 border-v2-accent'
          : 'text-v2-text-muted hover:text-v2-text-secondary'
      )}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Answers Panel
// ============================================================================

function AnswersPanel({ focusAnswerLabel }: { focusAnswerLabel?: string }) {
  const allMessages = useMessageStore((s) => s.messages);
  const agentOrder = useAgentStore((s) => s.agentOrder);
  const agentModels = useMessageStore((s) => s.agentModels);
  const answers = useAgentStore((s) => s.answers);
  const addTile = useTileStore((s) => s.addTile);

  const [expandedAnswer, setExpandedAnswer] = useState<string | null>(focusAnswerLabel || null);

  const allAnswers: (AnswerMessage & { agentModel?: string })[] = [];
  for (const agentId of agentOrder) {
    const messages = allMessages[agentId] || [];
    for (const msg of messages) {
      if (msg.type === 'answer') {
        allAnswers.push({ ...(msg as AnswerMessage), agentModel: agentModels[agentId] });
      }
    }
  }
  allAnswers.sort((a, b) => b.timestamp - a.timestamp);

  const handleViewWorkspace = (answerMsg: AnswerMessage) => {
    const match = answers.find((a) => a.agentId === answerMsg.agentId && a.answerNumber === answerMsg.answerNumber);
    if (match?.workspacePath) {
      addTile({ id: `workspace-${answerMsg.answerLabel}`, type: 'workspace-browser', targetId: match.workspacePath, label: `Files · ${answerMsg.answerLabel}` });
    }
  };

  if (allAnswers.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center space-y-2">
          <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" className="mx-auto text-yellow-500/30">
            <path d="M8 1l2.1 4.2L15 6l-3.5 3.4.8 4.8L8 12l-4.3 2.2.8-4.8L1 6l4.9-.8L8 1z" />
          </svg>
          <p className="text-sm text-v2-text-muted italic">No answers submitted yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto v2-scrollbar p-3 space-y-2">
      {allAnswers.map((answer) => {
        const isExpanded = expandedAnswer === answer.answerLabel;
        const agentColor = getAgentColor(answer.agentId, agentOrder);
        const agentName = answer.agentId.replace(/_/g, ' ');
        const displayContent = answer.fullContent || answer.contentPreview;
        const match = answers.find((a) => a.agentId === answer.agentId && a.answerNumber === answer.answerNumber);
        const hasWorkspace = !!match?.workspacePath;

        return (
          <div
            key={answer.id}
            className={cn(
              'rounded-lg border transition-colors duration-150',
              isExpanded ? 'bg-v2-surface border-yellow-500/30' : 'bg-v2-surface/50 border-v2-border hover:border-yellow-500/20 hover:bg-v2-surface'
            )}
          >
            <button
              onClick={() => setExpandedAnswer(isExpanded ? null : answer.answerLabel)}
              className="flex items-center gap-2.5 w-full text-left px-3 py-2.5"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: agentColor.hex }} />
              <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 shrink-0">
                {answer.answerLabel}
              </span>
              <span className="text-xs text-v2-text-secondary">
                {agentName}
                {answer.agentModel && <span className="text-v2-text-muted"> · {answer.agentModel}</span>}
              </span>
              <div className="flex-1" />
              <span className="text-[10px] text-v2-text-muted/50 tabular-nums shrink-0">
                {formatTimestamp(answer.timestamp)}
              </span>
              {hasWorkspace && (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-v2-text-muted/50 shrink-0">
                  <path d="M2 4.5A1.5 1.5 0 013.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5V4.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <svg className={cn('w-3 h-3 text-v2-text-muted transition-transform duration-150 shrink-0', isExpanded && 'rotate-90')} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {!isExpanded && answer.contentPreview && (
              <div className="px-3 pb-2.5 -mt-1">
                <p className="text-xs text-v2-text-muted line-clamp-2 pl-5">{answer.contentPreview}</p>
              </div>
            )}

            {isExpanded && (
              <div className="px-3 pb-3 animate-v2-fade-in">
                <div className="text-sm text-v2-text whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto v2-scrollbar pl-5 border-l-2 border-yellow-500/20 ml-0.5">
                  {displayContent}
                </div>
                {hasWorkspace && (
                  <div className="mt-2 pl-5">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleViewWorkspace(answer); }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-yellow-500/10 text-yellow-400/80 hover:text-yellow-400 hover:bg-yellow-500/15 transition-colors duration-150"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 4.5A1.5 1.5 0 013.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5V4.5z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      View workspace files
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Votes Panel (embedded VoteResults)
// ============================================================================

function VotesPanel() {
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
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center space-y-2">
          <svg width="32" height="32" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-violet-400/30">
            <rect x="2" y="3" width="12" height="10" rx="1.5" />
            <path d="M2 7h12" />
            <path d="M5.5 9.5l1.5 1.5 3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-sm text-v2-text-muted italic">No votes recorded yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto v2-scrollbar p-3">
      <div className="rounded-lg p-4 bg-v2-surface border border-v2-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-v2-text">Vote Distribution</h3>
          <span className="text-xs text-v2-text-muted">Total: {totalVotes}</span>
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
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color.hex }} />
                    <span className={isWinner ? 'font-medium' : 'text-v2-text-secondary'} style={isWinner ? { color: color.hexLight } : undefined}>
                      {agentId}
                    </span>
                    {isWinner && <span className="text-amber-400 text-xs">Winner</span>}
                  </div>
                  <span className={isWinner ? 'text-v2-text font-medium' : 'text-v2-text-muted'}>
                    {votes} vote{votes !== 1 ? 's' : ''}
                  </span>
                </div>
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

// ============================================================================
// Helpers
// ============================================================================

function formatTimestamp(ts: number): string {
  const d = new Date(ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
