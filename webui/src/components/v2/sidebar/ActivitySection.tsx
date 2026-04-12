import { useEffect, useRef, useMemo } from 'react';
import { cn } from '../../../lib/utils';
import { useMessageStore, type AnswerMessage, type VoteMessage } from '../../../stores/v2/messageStore';
import { useAgentStore } from '../../../stores/agentStore';
import { getAgentColor } from '../../../utils/agentColors';

interface ActivitySectionProps {
  collapsed: boolean;
}

interface ActivityEvent {
  id: string;
  type: 'answer' | 'vote';
  agentId: string;
  timestamp: number;
  text: string;
}

export function ActivitySection({ collapsed }: ActivitySectionProps) {
  const allMessages = useMessageStore((s) => s.messages);
  const agentOrder = useAgentStore((s) => s.agentOrder);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Collect answer + vote events from all agents, sorted newest-first
  const events = useMemo(() => {
    const items: ActivityEvent[] = [];

    for (const agentId of Object.keys(allMessages)) {
      const messages = allMessages[agentId] || [];
      for (const msg of messages) {
        if (msg.type === 'answer') {
          const answer = msg as AnswerMessage;
          items.push({
            id: answer.id,
            type: 'answer',
            agentId,
            timestamp: answer.timestamp,
            text: `submitted ${answer.answerLabel}`,
          });
        } else if (msg.type === 'vote') {
          const vote = msg as VoteMessage;
          const targetName = (vote.targetName || vote.targetId).split(' ')[0];
          items.push({
            id: vote.id,
            type: 'vote',
            agentId,
            timestamp: vote.timestamp,
            text: `voted for ${targetName}`,
          });
        }
      }
    }

    items.sort((a, b) => b.timestamp - a.timestamp);
    return items.slice(0, 15);
  }, [allMessages]);

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events.length]);

  if (events.length === 0 || collapsed) return null;

  return (
    <div className="py-1">
      <div className="flex items-center px-2 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-v2-text-muted">
          Activity
        </span>
      </div>

      <div
        ref={scrollRef}
        className="max-h-[160px] overflow-y-auto v2-scrollbar px-2 space-y-px"
      >
        {events.map((event) => (
          <ActivityEventRow
            key={event.id}
            event={event}
            agentOrder={agentOrder}
          />
        ))}
      </div>
    </div>
  );
}

function ActivityEventRow({
  event,
  agentOrder,
}: {
  event: ActivityEvent;
  agentOrder: string[];
}) {
  const agentColor = getAgentColor(event.agentId, agentOrder);
  const agentName = event.agentId.replace(/_/g, ' ');
  const elapsed = formatElapsed(event.timestamp);

  return (
    <div className="flex items-start gap-1.5 py-0.5 text-[10px] leading-tight">
      <span
        className="w-1.5 h-1.5 rounded-full mt-[3px] shrink-0"
        style={{ backgroundColor: agentColor.hex }}
      />
      <span className="flex-1 min-w-0 text-v2-text-muted">
        <span className="font-medium text-v2-text-secondary">{agentName}</span>
        {' '}
        <span className={cn(
          event.type === 'answer' && 'text-yellow-500/70',
          event.type === 'vote' && 'text-violet-400/70',
        )}>
          {event.text}
        </span>
      </span>
      <span className="text-v2-text-muted/50 shrink-0 tabular-nums">{elapsed}</span>
    </div>
  );
}

function formatElapsed(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - (timestamp < 1e12 ? timestamp * 1000 : timestamp);
  const diffS = Math.max(0, Math.floor(diffMs / 1000));

  if (diffS < 60) return `${diffS}s`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m`;
  const diffH = Math.floor(diffM / 60);
  return `${diffH}h`;
}
