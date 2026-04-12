import { useRef, useEffect, useMemo } from 'react';
import { cn } from '../../../lib/utils';
import { useMessageStore, type ChannelMessage, type ToolCallMessage } from '../../../stores/v2/messageStore';
import { usePreCollabStore } from '../../../stores/v2/preCollabStore';
import { useAgentStore } from '../../../stores/agentStore';
import { useSubagentEvents } from '../../../hooks/useSubagentEvents';
import { MessageRenderer } from '../channel/messages/MessageRenderer';
import { ToolBatchView } from '../channel/messages/ToolBatchView';

interface SubagentTileProps {
  subagentId: string;
}

/** Planning tools that should be hidden (shown in TaskPlanPanel instead) */
const PLAN_TOOLS = ['create_task_plan', 'update_task_status', 'add_task', 'edit_task'];

function isVisibleToolCall(msg: ChannelMessage): boolean {
  if (msg.type !== 'tool-call') return false;
  return !PLAN_TOOLS.some((pt) => (msg as ToolCallMessage).toolName.endsWith(pt));
}

type RenderItem =
  | { kind: 'message'; message: ChannelMessage }
  | { kind: 'batch'; tools: ToolCallMessage[] };

function GroupedMessages({ messages }: { messages: ChannelMessage[] }) {
  const items = useMemo(() => {
    const result: RenderItem[] = [];
    let toolBatch: ToolCallMessage[] = [];

    const flushBatch = () => {
      if (toolBatch.length === 0) return;
      if (toolBatch.length === 1) {
        result.push({ kind: 'message', message: toolBatch[0] });
      } else {
        result.push({ kind: 'batch', tools: [...toolBatch] });
      }
      toolBatch = [];
    };

    for (const msg of messages) {
      if (msg.type === 'tool-call' && !isVisibleToolCall(msg)) continue;

      if (msg.type === 'tool-call') {
        toolBatch.push(msg as ToolCallMessage);
      } else {
        flushBatch();
        result.push({ kind: 'message', message: msg });
      }
    }
    flushBatch();

    return result;
  }, [messages]);

  return (
    <>
      {items.map((item) => {
        if (item.kind === 'batch') {
          return <ToolBatchView key={item.tools[0].id} tools={item.tools} />;
        }
        return <MessageRenderer key={item.message.id} message={item.message} />;
      })}
    </>
  );
}

export function SubagentTile({ subagentId }: SubagentTileProps) {
  const messages = useMessageStore((s) => s.messages[subagentId] || []);
  const thread = useMessageStore((s) => s.threads.find((t) => t.id === subagentId));
  const sessionId = useAgentStore((s) => s.sessionId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Poll for inner events if this is a running pre-collab subagent
  const preCollabPhase = usePreCollabStore((s) => s.phases[subagentId]);
  const isPreCollab = !!preCollabPhase;
  const isRunning = preCollabPhase?.status === 'running';
  useSubagentEvents({
    sessionId,
    subagentId,
    enabled: isPreCollab && isRunning,
  });
  const isAutoScrollRef = useRef(true);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el && isAutoScrollRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    isAutoScrollRef.current = atBottom;
  };

  const statusColor = thread?.status === 'running' ? 'bg-v2-online' : 'bg-v2-offline';
  const statusLabel = thread?.status === 'running' ? 'Running' : 'Completed';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-v2-border-subtle bg-v2-surface shrink-0">
        <span className={cn('w-2 h-2 rounded-full shrink-0', statusColor, thread?.status === 'running' && 'animate-pulse')} />
        <span className="text-sm font-medium text-v2-text truncate">
          {subagentId.replace(/_/g, ' ')}
        </span>
        <span className="text-[10px] text-v2-text-muted">{statusLabel}</span>
        <div className="flex-1" />
        {thread?.task && (
          <span className="text-xs text-v2-text-muted truncate max-w-[200px]" title={thread.task}>
            {thread.task}
          </span>
        )}
      </div>

      {/* Message stream */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto v2-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3 animate-v2-welcome-fade-in">
              <div className="w-10 h-10 mx-auto rounded-full border-2 border-v2-accent/20 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-v2-border border-t-v2-accent animate-spin" />
              </div>
              <p className="text-sm text-v2-text-secondary">Waiting for subagent...</p>
              <div className="flex justify-center gap-1">
                <span className="w-1 h-1 rounded-full bg-v2-text-muted streaming-dot" style={{ animationDelay: '0s' }} />
                <span className="w-1 h-1 rounded-full bg-v2-text-muted streaming-dot" style={{ animationDelay: '0.15s' }} />
                <span className="w-1 h-1 rounded-full bg-v2-text-muted streaming-dot" style={{ animationDelay: '0.3s' }} />
              </div>
            </div>
          </div>
        ) : (
          <div className="py-1">
            <GroupedMessages messages={messages} />
          </div>
        )}
      </div>
    </div>
  );
}
