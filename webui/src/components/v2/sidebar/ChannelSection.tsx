import { useState, useEffect, useRef } from 'react';
import { cn } from '../../../lib/utils';
import { useAgentStore } from '../../../stores/agentStore';
import { useMessageStore, type AnswerMessage, type VoteMessage, type ChannelMessage } from '../../../stores/v2/messageStore';
import { useTileStore } from '../../../stores/v2/tileStore';
import { useWorkspaceModalStore } from '../../../stores/v2/workspaceModalStore';
import { getAgentColor } from '../../../utils/agentColors';
import { SidebarItem } from './SessionSection';

interface ChannelSectionProps {
  collapsed: boolean;
}

export function ChannelSection({ collapsed }: ChannelSectionProps) {
  const agents = useAgentStore((s) => s.agents);
  const agentOrder = useAgentStore((s) => s.agentOrder);
  const allMessages = useMessageStore((s) => s.messages);
  const currentRound = useMessageStore((s) => s.currentRound);
  const { tiles, setTile } = useTileStore();

  const activeAgentTileId = tiles.find((t) => t.type === 'agent-channel')?.targetId;

  // Track which agents have their answer list expanded
  const [expandedAnswers, setExpandedAnswers] = useState<Record<string, boolean>>({});

  // Stagger animation: only on first agent arrival
  const [hasAnimated, setHasAnimated] = useState(false);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (agentOrder.length > 0 && prevCountRef.current === 0) {
      const timeout = setTimeout(() => setHasAnimated(true), agentOrder.length * 80 + 300);
      return () => clearTimeout(timeout);
    }
    prevCountRef.current = agentOrder.length;
  }, [agentOrder.length]);

  const openModal = useWorkspaceModalStore((s) => s.open);

  const handleChannelClick = (agentId: string) => {
    const agent = agents[agentId];
    setTile({
      id: `channel-${agentId}`,
      type: 'agent-channel',
      targetId: agentId,
      label: agent?.modelName || agentId,
    });
  };

  const handleAnswerClick = (answerLabel: string) => {
    openModal('answers', answerLabel);
  };

  const toggleAnswers = (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedAnswers((prev) => ({ ...prev, [agentId]: !prev[agentId] }));
  };

  return (
    <div className="py-1">
      {!collapsed && (
        <div className="flex items-center px-2 py-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-v2-text-muted">
            Channels
          </span>
        </div>
      )}

      <div className="space-y-0.5">
        {agentOrder.map((agentId, index) => {
          const agent = agents[agentId];
          if (!agent) return null;
          const isActive = activeAgentTileId === agentId;
          const agentColor = getAgentColor(agentId, agentOrder);
          const isWorking = agent.status === 'working' || agent.status === 'voting';
          const shouldAnimate = !hasAnimated;

          // Get messages for this agent
          const messages = allMessages[agentId] || [];
          const answerMessages = messages.filter((m) => m.type === 'answer') as AnswerMessage[];
          const round = currentRound[agentId] || 0;

          // Derive recent action from latest coordination message
          const recentAction = getRecentAction(agent.status, messages);
          const showAnswers = expandedAnswers[agentId] && answerMessages.length > 0;

          return (
            <div
              key={agentId}
              className={shouldAnimate ? 'opacity-0 animate-v2-stagger-fade-in' : undefined}
              style={shouldAnimate ? { animationDelay: `${index * 80}ms`, animationFillMode: 'forwards' } : undefined}
            >
              <SidebarItem
                collapsed={collapsed}
                active={isActive}
                onClick={() => handleChannelClick(agentId)}
                icon={
                  <span
                    className={cn('w-2 h-2 rounded-full', isWorking && 'animate-pulse')}
                    style={{ backgroundColor: agentColor.hex }}
                  />
                }
                label={formatChannelLabel(agentId, agent.modelName)}
              />

              {/* Status subtitle + nested answers */}
              {!collapsed && (round > 0 || answerMessages.length > 0) && (
                <div className="pl-8 pr-2">
                  {/* Status line */}
                  <div className="text-[10px] text-v2-text-muted leading-tight py-0.5">
                    {round > 0 && (
                      <span>R{round}</span>
                    )}
                    {answerMessages.length > 0 && (
                      <span>{round > 0 ? ' · ' : ''}{answerMessages.length} answer{answerMessages.length !== 1 ? 's' : ''}</span>
                    )}
                    {recentAction && (
                      <span>{(round > 0 || answerMessages.length > 0) ? ' · ' : ''}{recentAction}</span>
                    )}
                  </div>

                  {/* Answers toggle */}
                  {answerMessages.length > 0 && (
                    <button
                      onClick={(e) => toggleAnswers(agentId, e)}
                      className="flex items-center gap-1 text-[10px] text-v2-text-muted hover:text-v2-text-secondary transition-colors py-0.5"
                    >
                      <svg
                        className={cn(
                          'w-2.5 h-2.5 transition-transform duration-150',
                          showAnswers && 'rotate-90'
                        )}
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Answers
                    </button>
                  )}

                  {/* Nested answer list */}
                  {showAnswers && (
                    <div className="space-y-0.5 pb-1 animate-v2-fade-in">
                      {answerMessages.map((answer) => (
                        <NestedAnswerItem
                          key={answer.id}
                          answer={answer}
                          round={currentRound[agentId] || 0}
                          onClick={() => handleAnswerClick(answer.answerLabel)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {agentOrder.length === 0 && !collapsed && (
          <p className="text-xs text-v2-text-muted px-2 py-2 italic">
            No agents yet
          </p>
        )}
      </div>
    </div>
  );
}

// Compact answer item nested under a channel
function NestedAnswerItem({
  answer,
  onClick,
}: {
  answer: AnswerMessage;
  round: number;
  onClick: () => void;
}) {
  const preview = answer.contentPreview
    ? answer.contentPreview.slice(0, 60).replace(/\n/g, ' ')
    : '';

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 w-full text-left px-1 py-0.5 rounded',
        'hover:bg-v2-sidebar-hover transition-colors duration-100',
        'text-[10px] text-v2-text-muted'
      )}
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="text-yellow-500/60 shrink-0">
        <path d="M8 1l2.1 4.2L15 6l-3.5 3.4.8 4.8L8 12l-4.3 2.2.8-4.8L1 6l4.9-.8L8 1z" />
      </svg>
      <span className="font-medium text-yellow-500/70 shrink-0">{answer.answerLabel}</span>
      <span className="truncate opacity-70">{preview ? `"${preview}"` : ''}</span>
    </button>
  );
}

function getRecentAction(
  status: string,
  messages: ChannelMessage[]
): string {
  // Check latest coordination messages in reverse
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === 'vote') {
      const vote = msg as VoteMessage;
      const targetName = vote.targetName || vote.targetId;
      const shortTarget = String(targetName).split(' ')[0];
      return `Voted for ${shortTarget}`;
    }
    if (msg.type === 'answer') {
      const answer = msg as AnswerMessage;
      return `Submitted ${answer.answerLabel}`;
    }
  }

  const statusMap: Record<string, string> = {
    working: 'Working',
    voting: 'Evaluating',
    completed: 'Done',
    failed: 'Failed',
    waiting: 'Waiting',
  };
  return statusMap[status] || '';
}

function formatChannelLabel(agentId: string, modelName?: string): string {
  const name = agentId.replace(/_/g, ' ');
  if (modelName) {
    return `${name} (${modelName})`;
  }
  return name;
}
