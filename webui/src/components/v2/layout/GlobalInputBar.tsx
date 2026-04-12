import { useState, useEffect, useRef } from 'react';
import { cn } from '../../../lib/utils';
import { useAgentStore } from '../../../stores/agentStore';
import { useMessageStore } from '../../../stores/v2/messageStore';
import { useModeStore } from '../../../stores/v2/modeStore';
import { useWizardStore } from '../../../stores/wizardStore';
import { parseBroadcastTargets } from '../../../utils/broadcastTargets';
import type { ConnectionStatus } from '../../../hooks/useWebSocket';
import type { ConfigInfo } from '../../../types';
import { ConfigViewerModal } from './ConfigViewerModal';
import { AgentMentionAutocomplete, type AgentMentionAutocompleteHandle } from './AgentMentionAutocomplete';

interface GlobalInputBarProps {
  wsStatus: ConnectionStatus;
  startCoordination: (question: string, configPath?: string) => void;
  continueConversation: (question: string) => void;
  cancelCoordination?: () => void;
  onNewSession?: () => void;
  selectedConfig: string | null;
  onConfigChange: (configPath: string) => void;
  hasActiveSession: boolean;
  isComplete: boolean;
  isLaunching?: boolean;
  broadcastMessage?: (message: string, targets: string[] | null) => void;
  refreshTrigger?: number;
}

export function GlobalInputBar({
  wsStatus,
  startCoordination,
  continueConversation,
  cancelCoordination,
  onNewSession,
  selectedConfig,
  onConfigChange,
  hasActiveSession,
  isComplete,
  isLaunching,
  broadcastMessage,
  refreshTrigger,
}: GlobalInputBarProps) {
  const [message, setMessage] = useState('');
  const [configs, setConfigs] = useState<ConfigInfo[]>([]);
  const [showConfigDropdown, setShowConfigDropdown] = useState(false);
  const [showConfigViewer, setShowConfigViewer] = useState(false);
  const [configViewPath, setConfigViewPath] = useState('');
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [queuedBroadcast, setQueuedBroadcast] = useState<{
    content: string;
    targets: string[] | null;
    timestamp: number;
  } | null>(null);
  const mentionRef = useRef<AgentMentionAutocompleteHandle>(null);

  // Clear queued broadcast when new agent activity arrives
  const messageStoreMessages = useMessageStore((s) => s.messages);
  const totalMessageCount = Object.values(messageStoreMessages).reduce(
    (sum, msgs) => sum + msgs.length, 0
  );
  const lastCountRef = useRef(totalMessageCount);
  useEffect(() => {
    if (queuedBroadcast && totalMessageCount > lastCountRef.current) {
      setQueuedBroadcast(null);
    }
    lastCountRef.current = totalMessageCount;
  }, [totalMessageCount, queuedBroadcast]);

  const customConfigPath = useModeStore((s) => s.customConfigPath);

  // Fetch available configs (re-fetch when refreshTrigger changes after wizard save)
  useEffect(() => {
    fetch('/api/configs')
      .then((res) => res.json())
      .then((data: { configs: ConfigInfo[] }) => {
        setConfigs(data.configs || []);
        // Auto-select: if no config selected and no CLI --config override,
        // default to Custom mode (which uses customConfigPath)
        if (!selectedConfig) {
          const urlParams = new URLSearchParams(window.location.search);
          const cliConfig = urlParams.get('config');
          if (cliConfig) {
            // CLI --config passed → select that config
            onConfigChange(cliConfig);
          } else if (customConfigPath) {
            // Custom config exists → select it
            onConfigChange(customConfigPath);
          }
          // else: needsFirstTimeSetup — Custom will be selected via sentinel
        }
      })
      .catch(() => {});
  }, [refreshTrigger, customConfigPath]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || wsStatus !== 'connected') return;

    if (hasActiveSession && isComplete) {
      // Follow-up question — update store state then send WS message
      useAgentStore.getState().startContinuation(message.trim());
      useMessageStore.getState().reset();
      continueConversation(message.trim());
    } else if (!hasActiveSession) {
      // Start new session
      useMessageStore.getState().reset();
      useAgentStore.getState().beginLaunch(message.trim());
      startCoordination(message.trim(), selectedConfig || undefined);
    } else if (hasActiveSession && !isComplete && broadcastMessage) {
      // Active session, not complete — broadcast to agents
      const { cleanMessage, targets } = parseBroadcastTargets(message);
      broadcastMessage(cleanMessage, targets);
      // Show queued banner until next agent activity
      setQueuedBroadcast({ content: cleanMessage, targets, timestamp: Date.now() });
      // Show brief "Sent" confirmation
      setBroadcastSent(true);
      setTimeout(() => setBroadcastSent(false), 2000);
    }

    setMessage('');
  };

  const isConnected = wsStatus === 'connected';
  const agentCount = useModeStore((s) => s.agentCount);
  const agentConfigs = useModeStore((s) => s.agentConfigs);
  const configLocked = useModeStore((s) => s.configLocked);

  // Lock config selector and new-session during active coordination
  const runLocked = hasActiveSession && !isComplete;

  // In custom mode (agentCount set, not configLocked), all agents must have a provider
  const agentsReady = configLocked || agentCount === null || agentConfigs.every((c) => c.provider);
  const canSend = isConnected && message.trim().length > 0 && agentsReady;

  const isCustomConfig = selectedConfig === customConfigPath ||
    (!selectedConfig && customConfigPath);
  const needsFirstTimeSetup = useModeStore((s) => s.needsFirstTimeSetup);

  // Determine placeholder text
  let placeholder = 'Type a question to start...';
  if (isLaunching) {
    placeholder = 'Launching coordination...';
  } else if (!agentsReady) {
    placeholder = 'Configure agent models first...';
  } else if (!selectedConfig && !customConfigPath && needsFirstTimeSetup) {
    placeholder = 'Configure agents to get started...';
  } else if (!selectedConfig && !customConfigPath) {
    placeholder = 'Select a config first...';
  } else if (hasActiveSession && !isComplete) {
    placeholder = 'Broadcast: @all or @agent_name ...';
  } else if (isComplete) {
    placeholder = 'Ask a follow-up question...';
  }

  const configName = isCustomConfig
    ? 'Custom'
    : selectedConfig
      ? selectedConfig.split('/').pop()?.replace('.yaml', '') || 'config'
      : needsFirstTimeSetup
        ? 'Custom'
        : 'No config';

  const targetLabel = queuedBroadcast?.targets
    ? queuedBroadcast.targets.join(', ')
    : 'all agents';

  return (
    <div className="border-t border-v2-border bg-v2-surface px-4 py-3">
      {/* Disconnected banner */}
      {(wsStatus === 'disconnected' || wsStatus === 'error') && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded bg-red-500/8 border border-red-500/20 animate-v2-fade-in">
          <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 animate-pulse" />
          <span className="text-xs text-red-300 font-medium">
            Connection lost
          </span>
          <span className="text-[10px] text-red-400/60">
            Reconnecting...
          </span>
        </div>
      )}

      {/* Queued broadcast banner */}
      {queuedBroadcast && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded bg-purple-500/5 border border-purple-500/20 animate-v2-fade-in">
          <span className="text-purple-400 text-xs font-medium shrink-0">Queued:</span>
          <span className="text-xs text-v2-text-secondary truncate">
            {queuedBroadcast.content.length > 60
              ? queuedBroadcast.content.slice(0, 60) + '...'
              : queuedBroadcast.content}
          </span>
          <span className="text-[10px] text-purple-400/60 shrink-0">
            &rarr; {targetLabel}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setQueuedBroadcast(null)}
            className="shrink-0 text-v2-text-muted hover:text-v2-text transition-colors"
            title="Dismiss"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        {/* Config selector — locked during active coordination */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { if (!runLocked) setShowConfigDropdown(!showConfigDropdown); }}
            disabled={runLocked}
            className={cn(
              'flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-v2-input',
              'border border-v2-border bg-[var(--v2-input-bg)]',
              'text-v2-text-secondary hover:text-v2-text',
              'transition-colors duration-150 whitespace-nowrap',
              !selectedConfig && 'text-v2-idle',
              runLocked && 'opacity-50 cursor-not-allowed pointer-events-none'
            )}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {configName}
          </button>

          {showConfigDropdown && (
            <div className="absolute bottom-full left-0 mb-1 w-72 max-h-64 overflow-y-auto v2-scrollbar bg-v2-surface-raised border border-v2-border rounded-v2-card shadow-lg z-50">
              {/* Custom config — always first */}
              <div
                data-testid="config-option-custom"
                className={cn(
                  'flex items-center px-3 py-2',
                  'hover:bg-[var(--v2-channel-hover)]',
                  'transition-colors duration-100',
                  isCustomConfig
                    ? 'text-v2-accent bg-v2-accent/5'
                    : 'text-v2-text-secondary'
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (customConfigPath) {
                      onConfigChange(customConfigPath);
                    }
                    // Even without a path, selecting Custom signals intent
                    setShowConfigDropdown(false);
                  }}
                  className="flex-1 text-left text-sm min-w-0"
                >
                  <div className="font-medium">Custom</div>
                  <div className="text-[10px] text-v2-text-muted">
                    {customConfigPath ? 'webui_config.yaml' : 'Configure via mode bar'}
                  </div>
                </button>
              </div>

              {/* Saved configs */}
              {configs
                .filter((c) => c.path !== customConfigPath)
                .map((config) => (
                <button
                  key={config.path}
                  type="button"
                  onClick={() => {
                    onConfigChange(config.path);
                    setShowConfigDropdown(false);
                  }}
                  className={cn(
                    'w-full flex items-center px-3 py-2 text-left',
                    'hover:bg-[var(--v2-channel-hover)]',
                    'transition-colors duration-100 cursor-pointer',
                    config.path === selectedConfig && !isCustomConfig
                      ? 'text-v2-accent bg-v2-accent/5'
                      : 'text-v2-text-secondary'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{config.name}</div>
                    <div className="text-[10px] text-v2-text-muted truncate">{config.relative}</div>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfigViewPath(config.path);
                      setShowConfigViewer(true);
                      setShowConfigDropdown(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        setConfigViewPath(config.path);
                        setShowConfigViewer(true);
                        setShowConfigDropdown(false);
                      }
                    }}
                    className="shrink-0 p-1 ml-1 text-v2-text-muted hover:text-v2-text rounded"
                    title="View config"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="8" cy="8" r="3" />
                      <path d="M1 8c1.5-3 4-5 7-5s5.5 2 7 5c-1.5 3-4 5-7 5s-5.5-2-7-5z" />
                    </svg>
                  </span>
                </button>
              ))}
              {configs.length === 0 && (
                <div className="px-3 py-2 text-xs text-v2-text-muted">No other configs found</div>
              )}
              {/* New Config button */}
              <div className="border-t border-v2-border">
                <button
                  type="button"
                  onClick={() => {
                    useWizardStore.getState().openWizard();
                    setShowConfigDropdown(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm',
                    'text-v2-accent hover:bg-[var(--v2-channel-hover)]',
                    'transition-colors duration-100'
                  )}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                  </svg>
                  New Config
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Connection status dot */}
        <span
          className={cn(
            'w-2 h-2 rounded-full shrink-0',
            wsStatus === 'connected' ? 'bg-v2-online' : 'bg-red-500'
          )}
          title={wsStatus}
        />

        {/* Input */}
        <div className="flex-1 relative">
          <AgentMentionAutocomplete
            ref={mentionRef}
            inputValue={message}
            onSelect={(newValue) => setMessage(newValue)}
            enabled={hasActiveSession && !isComplete}
          />
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (mentionRef.current?.handleKeyDown(e)) return;
            }}
            placeholder={placeholder}
            disabled={!isConnected || (!selectedConfig && !customConfigPath && !hasActiveSession) || !!isLaunching}
            className={cn(
              'w-full rounded-v2-input bg-[var(--v2-input-bg)] px-4 py-2.5',
              'text-sm text-v2-text placeholder:text-v2-text-muted',
              'border-none outline-none',
              'focus:ring-2 focus:ring-v2-accent/50',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-shadow duration-150'
            )}
          />
        </div>

        {/* Cancel button (during active session — prominent red) */}
        {hasActiveSession && !isComplete && cancelCoordination && (
          <button
            type="button"
            onClick={cancelCoordination}
            className={cn(
              'rounded-v2-input px-4 py-2.5 text-sm font-medium',
              'bg-red-500 text-white',
              'hover:bg-red-600',
              'transition-colors duration-150',
              'flex items-center gap-1.5'
            )}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round" />
            </svg>
            Cancel
          </button>
        )}

        {/* New Session button (when complete) */}
        {isComplete && onNewSession && (
          <button
            type="button"
            onClick={onNewSession}
            className={cn(
              'rounded-v2-input px-3 py-2.5 text-sm font-medium',
              'bg-v2-surface-raised text-v2-text-secondary border border-v2-border',
              'hover:text-v2-text hover:bg-v2-sidebar-hover',
              'transition-colors duration-150',
              'flex items-center gap-1.5'
            )}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3v10M3 8h10" strokeLinecap="round" />
            </svg>
            New
          </button>
        )}

        {/* Send / Launch button */}
        {broadcastSent ? (
          <span className="text-xs text-v2-online font-medium px-3 py-2.5 whitespace-nowrap">
            Sent
          </span>
        ) : (
          <button
            type="submit"
            disabled={!canSend || !!isLaunching}
            className={cn(
              'rounded-v2-input px-4 py-2.5 text-sm font-medium',
              'bg-v2-accent text-white',
              'hover:bg-v2-accent-hover',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-colors duration-150'
            )}
          >
            {isLaunching ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Launching
              </span>
            ) : hasActiveSession && !isComplete ? 'Send' : isComplete ? 'Continue' : 'Start'}
          </button>
        )}
      </form>

      {/* Config Viewer Modal */}
      <ConfigViewerModal
        isOpen={showConfigViewer}
        onClose={() => setShowConfigViewer(false)}
        configPath={configViewPath}
      />
    </div>
  );
}
