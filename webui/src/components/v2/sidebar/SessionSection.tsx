import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '../../../lib/utils';
import { useAgentStore } from '../../../stores/agentStore';
import { useMessageStore } from '../../../stores/v2/messageStore';
import { useTileStore } from '../../../stores/v2/tileStore';
import type { SessionInfo } from '../../../types';

// localStorage key for custom session names
const SESSION_NAMES_KEY = 'massgen_session_names';
const VISIBLE_COUNT = 20;
const LOAD_MORE_COUNT = 20;

function getCustomNames(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SESSION_NAMES_KEY) || '{}');
  } catch {
    return {};
  }
}

function setCustomName(sessionId: string, name: string) {
  const names = getCustomNames();
  names[sessionId] = name;
  localStorage.setItem(SESSION_NAMES_KEY, JSON.stringify(names));
}

function removeCustomName(sessionId: string) {
  const names = getCustomNames();
  delete names[sessionId];
  localStorage.setItem(SESSION_NAMES_KEY, JSON.stringify(names));
}

function formatTimestamp(ts?: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

interface SessionSectionProps {
  collapsed: boolean;
  onSessionChange?: (sessionId: string) => void;
  onNewSession?: () => void;
  onConfigChange?: (configPath: string) => void;
}

export function SessionSection({ collapsed, onSessionChange, onNewSession, onConfigChange }: SessionSectionProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [customNames, setCustomNames] = useState<Record<string, string>>(getCustomNames);
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(VISIBLE_COUNT);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const currentSessionId = useAgentStore((s) => s.sessionId);
  const question = useAgentStore((s) => s.question);
  const isComplete = useAgentStore((s) => s.isComplete);
  const automationMode = useAgentStore((s) => s.automationMode);
  // Only lock session switching during active automation runs.
  // Interactive mode (--web without --automation) should always allow browsing.
  const runLocked = automationMode && !!question && !isComplete;

  const handleSwitchSession = useCallback((session: SessionInfo) => {
    const sessionId = session.session_id;
    if (!onSessionChange || sessionId === currentSessionId) return;
    useMessageStore.getState().reset();
    useTileStore.getState().reset();
    onSessionChange(sessionId);

    // Load the session's config if available
    if (session.config_path && onConfigChange) {
      onConfigChange(session.config_path);
    }
  }, [onSessionChange, onConfigChange, currentSessionId]);

  const fetchSessions = useCallback(() => {
    fetch('/api/sessions')
      .then((res) => res.json())
      .then((data: { sessions: SessionInfo[] }) => {
        setSessions(data.sessions || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [currentSessionId, fetchSessions]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingSessionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSessionId]);

  // Close menu/expanded on outside click
  useEffect(() => {
    if (!menuSessionId && !expandedSessionId) return;
    const handleClick = () => {
      setMenuSessionId(null);
      setExpandedSessionId(null);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [menuSessionId, expandedSessionId]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    setMenuSessionId(null);
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      removeCustomName(sessionId);
      setCustomNames(getCustomNames());
    } catch {
      // Silently fail — session may already be gone
    }
  }, []);

  const handleStartRename = useCallback((sessionId: string, currentLabel: string) => {
    setMenuSessionId(null);
    setEditingSessionId(sessionId);
    setEditValue(customNames[sessionId] || currentLabel);
  }, [customNames]);

  const handleCommitRename = useCallback(() => {
    if (!editingSessionId) return;
    const trimmed = editValue.trim();
    if (trimmed) {
      setCustomName(editingSessionId, trimmed);
    } else {
      removeCustomName(editingSessionId);
    }
    setCustomNames(getCustomNames());
    setEditingSessionId(null);
  }, [editingSessionId, editValue]);

  const handleCancelRename = useCallback(() => {
    setEditingSessionId(null);
  }, []);

  const getDisplayLabel = useCallback((session: SessionInfo) => {
    const custom = customNames[session.session_id];
    if (custom) return custom;
    const base = session.question || session.session_id.slice(0, 8);
    return base.length > 30 ? base.slice(0, 30) + '...' : base;
  }, [customNames]);

  // Filter sessions by search query
  const filtered = searchQuery.trim()
    ? sessions.filter((s) => {
        const q = searchQuery.toLowerCase();
        return (
          (s.question || '').toLowerCase().includes(q) ||
          (s.config || '').toLowerCase().includes(q) ||
          s.session_id.toLowerCase().includes(q)
        );
      })
    : sessions;

  const visibleSessions = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  return (
    <div className="py-1 flex flex-col">
      {!collapsed && (
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-v2-text-muted">
            Sessions
          </span>
          <button
            onClick={runLocked ? undefined : onNewSession}
            disabled={runLocked}
            className={cn(
              'flex items-center justify-center w-4 h-4 rounded',
              'text-v2-text-muted hover:text-v2-text',
              'transition-colors duration-150',
              runLocked && 'opacity-40 cursor-not-allowed'
            )}
            title={runLocked ? 'Locked during active run' : 'New session'}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Search bar */}
      {!collapsed && (
        <div className="px-2 pb-1">
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setVisibleCount(VISIBLE_COUNT);
            }}
            placeholder="Search sessions..."
            className={cn(
              'w-full text-xs px-2 py-1 rounded',
              'bg-v2-sidebar border border-v2-border/50',
              'text-v2-text placeholder:text-v2-text-muted/50',
              'outline-none focus:border-v2-accent/50',
              'transition-colors duration-100'
            )}
          />
        </div>
      )}

      <div className="space-y-0.5 overflow-y-auto v2-scrollbar" style={{ maxHeight: 'calc(100vh - 360px)' }}>
        {visibleSessions.map((session) => {
          const isActive = session.session_id === currentSessionId;
          const label = isActive
            ? (customNames[currentSessionId] || (question && question.length > 30 ? question.slice(0, 30) + '...' : question) || session.session_id.slice(0, 8))
            : getDisplayLabel(session);
          const isEditing = editingSessionId === session.session_id;
          const showMenu = menuSessionId === session.session_id;
          const isExpanded = expandedSessionId === session.session_id;
          const subtitle = (session.models && session.models.length > 0)
            ? session.models.join(', ')
            : session.config || undefined;
          const timeLabel = formatTimestamp(session.start_time);

          return (
            <div key={session.session_id} className="relative group">
              {isEditing ? (
                <div className="px-2 py-1">
                  <input
                    ref={editInputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCommitRename();
                      if (e.key === 'Escape') handleCancelRename();
                    }}
                    onBlur={handleCommitRename}
                    className={cn(
                      'w-full text-sm px-2 py-1 rounded',
                      'bg-v2-surface border border-v2-accent/50',
                      'text-v2-text outline-none'
                    )}
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center">
                    <div
                      className="flex-1 min-w-0"
                      onDoubleClick={() => handleStartRename(session.session_id, label)}
                    >
                      <SidebarItem
                        icon={
                          <span
                            className={cn(
                              'w-2 h-2 rounded-full',
                              isActive || session.is_running ? 'bg-v2-online' : 'bg-v2-offline'
                            )}
                          />
                        }
                        label={label}
                        subtitle={subtitle}
                        active={isActive}
                        collapsed={collapsed}
                        disabled={runLocked && !isActive}
                        onClick={isActive || runLocked ? undefined : () => handleSwitchSession(session)}
                      />
                    </div>
                    {/* Info + kebab buttons — visible on hover */}
                    {!collapsed && (
                      <div className={cn(
                        'shrink-0 flex items-center gap-0.5 mr-1',
                        'transition-opacity duration-100',
                        (showMenu || isExpanded) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      )}>
                        {/* Info peek button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedSessionId(isExpanded ? null : session.session_id);
                            setMenuSessionId(null);
                          }}
                          className={cn(
                            'flex items-center justify-center w-5 h-5 rounded',
                            'text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover',
                          )}
                          title="Session details"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="5" cy="5" r="4" />
                            <path d="M5 4.5V7M5 3V3.5" strokeLinecap="round" />
                          </svg>
                        </button>
                        {/* Kebab menu button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuSessionId(showMenu ? null : session.session_id);
                            setExpandedSessionId(null);
                          }}
                          className={cn(
                            'flex items-center justify-center w-5 h-5 rounded',
                            'text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover',
                          )}
                          title="Session options"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                            <circle cx="5" cy="2" r="1" />
                            <circle cx="5" cy="5" r="1" />
                            <circle cx="5" cy="8" r="1" />
                          </svg>
                        </button>
                      </div>
                    )}
                    {/* Dropdown menu */}
                    {showMenu && !collapsed && (
                      <div
                        className={cn(
                          'absolute right-0 top-full z-50 mt-0.5',
                          'bg-v2-surface-raised border border-v2-border rounded-v2-card shadow-lg',
                          'py-1 min-w-[120px]'
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleStartRename(session.session_id, label)}
                          className="w-full text-left px-3 py-1.5 text-xs text-v2-text-secondary hover:bg-[var(--v2-channel-hover)] hover:text-v2-text"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => handleDeleteSession(session.session_id)}
                          className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Expanded info panel */}
                  {isExpanded && !collapsed && (
                    <div
                      className={cn(
                        'mx-2 mb-1 px-2 py-1.5 rounded',
                        'bg-v2-surface border border-v2-border/50',
                        'text-[10px] text-v2-text-secondary space-y-0.5'
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-v2-text text-xs break-words">
                        {session.question || session.session_id}
                      </div>
                      {session.models && session.models.length > 0 && (
                        <div><span className="text-v2-text-muted">Models:</span> {session.models.join(', ')}</div>
                      )}
                      {session.config && (
                        <div><span className="text-v2-text-muted">Config:</span> {session.config}</div>
                      )}
                      {timeLabel && (
                        <div><span className="text-v2-text-muted">Time:</span> {timeLabel}</div>
                      )}
                      <div className="text-v2-text-muted font-mono truncate">{session.session_id.slice(0, 20)}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* Load more button */}
        {hasMore && !collapsed && (
          <button
            onClick={() => setVisibleCount((c) => c + LOAD_MORE_COUNT)}
            className={cn(
              'w-full text-center py-1.5 text-xs',
              'text-v2-text-muted hover:text-v2-accent',
              'transition-colors duration-100'
            )}
          >
            Load more ({filtered.length - visibleCount} remaining)
          </button>
        )}

        {filtered.length === 0 && !collapsed && (
          <p className="text-xs text-v2-text-muted px-2 py-2 italic">
            {searchQuery ? 'No matching sessions' : 'No sessions'}
          </p>
        )}
      </div>
    </div>
  );
}

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  active?: boolean;
  collapsed: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function SidebarItem({ icon, label, subtitle, active, collapsed, disabled, onClick }: SidebarItemProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 w-full rounded px-2 py-1.5 text-sm',
        'transition-colors duration-100',
        active
          ? 'bg-[var(--v2-channel-active)] text-v2-text'
          : 'text-v2-text-secondary hover:bg-[var(--v2-channel-hover)] hover:text-v2-text',
        collapsed && 'justify-center px-0',
        disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent'
      )}
      title={collapsed ? label : (disabled ? 'Locked during active run' : undefined)}
    >
      <span className="shrink-0 flex items-center justify-center w-5 h-5">
        {icon}
      </span>
      {!collapsed && (
        <div className="min-w-0 flex-1 text-left">
          <span className="block truncate">{label}</span>
          {subtitle && (
            <span className="block truncate text-[10px] text-v2-text-muted leading-tight">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
