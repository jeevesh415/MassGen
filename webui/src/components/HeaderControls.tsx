/**
 * HeaderControls Component
 *
 * Config selector dropdown and session management controls.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, FolderOpen, Users, ChevronDown, RefreshCw, Plus, FileText, Sun, Moon, Monitor, Search, X, Wand2, Eye, Vote, Wrench } from 'lucide-react';
import type { ConfigInfo, SessionInfo } from '../types';
import { useThemeStore, selectThemeMode, selectSetThemeMode, type ThemeMode } from '../stores/themeStore';
import { useWizardStore } from '../stores/wizardStore';

interface HeaderControlsProps {
  currentSessionId: string;
  selectedConfig: string | null;
  onConfigChange: (configPath: string) => void;
  onSessionChange: (sessionId: string) => void;
  onNewSession: () => void;
  onOpenAnswerBrowser: () => void;
  onOpenVoteBrowser: () => void;
  onViewConfig: () => void;
  answerCount: number;
  voteCount: number;
}

export function HeaderControls({
  currentSessionId,
  selectedConfig,
  onConfigChange,
  onSessionChange,
  onNewSession,
  onOpenAnswerBrowser,
  onOpenVoteBrowser,
  onViewConfig,
  answerCount,
  voteCount,
}: HeaderControlsProps) {
  const [configs, setConfigs] = useState<ConfigInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [defaultConfig, setDefaultConfig] = useState<string | null>(null);
  const [showConfigDropdown, setShowConfigDropdown] = useState(false);
  const [showSessionDropdown, setShowSessionDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [configSearch, setConfigSearch] = useState('');
  const [sessionIdInput, setSessionIdInput] = useState('');

  // Theme state
  const themeMode = useThemeStore(selectThemeMode);
  const setThemeMode = useThemeStore(selectSetThemeMode);

  // Wizard state
  const openWizard = useWizardStore((s) => s.openWizard);

  const cycleTheme = () => {
    const modes: ThemeMode[] = ['light', 'dark', 'system'];
    const currentIndex = modes.indexOf(themeMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setThemeMode(modes[nextIndex]);
  };

  const ThemeIcon = themeMode === 'light' ? Sun : themeMode === 'dark' ? Moon : Monitor;

  // Auto-open wizard when no config is selected
  // Note: First-time setup redirect is handled by main.tsx Router
  useEffect(() => {
    // Only auto-open after initial loading is complete
    if (loading) return;

    // Don't auto-open wizard if URL params provide a config
    const urlConfigParam = new URLSearchParams(window.location.search).get('config');
    if (urlConfigParam) return;

    // Open wizard if no config is currently selected AND no default exists
    // (First-time setup is now handled by Router redirecting to /setup)
    const shouldOpenWizard = !selectedConfig && !defaultConfig;

    if (shouldOpenWizard) {
      openWizard();
    }
  }, [loading, openWizard, selectedConfig, defaultConfig]);

  // Fetch available configs
  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/configs');
      const data = await res.json();
      setConfigs(data.configs || []);
      setDefaultConfig(data.default);
      // Don't override if URL params specify a config (prevents race condition)
      const urlConfigParam = new URLSearchParams(window.location.search).get('config');
      if (!selectedConfig && !urlConfigParam && data.default) {
        onConfigChange(data.default);
      }
    } catch (err) {
      console.error('Failed to fetch configs:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedConfig, onConfigChange]);

  // Fetch active sessions
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
    fetchSessions();
    // Poll sessions every 5 seconds
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchConfigs, fetchSessions]);

  // Filter configs by search term and exclude AG2 configs
  const filteredConfigs = (configSearch.trim()
    ? configs.filter(c =>
        c.name.toLowerCase().includes(configSearch.toLowerCase()) ||
        c.category.toLowerCase().includes(configSearch.toLowerCase()) ||
        c.path.toLowerCase().includes(configSearch.toLowerCase())
      )
    : configs
  ).filter(c => c.category.toLowerCase() !== 'ag2' && !c.name.toLowerCase().startsWith('ag2'));

  // Group filtered configs by category
  const groupedConfigs = filteredConfigs.reduce<Record<string, ConfigInfo[]>>((acc, config) => {
    const cat = config.category || 'root';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(config);
    return acc;
  }, {});

  // Order categories: user first, then alphabetically
  const categoryOrder = ['user', ...Object.keys(groupedConfigs).filter(c => c !== 'user').sort()];
  const orderedCategories = categoryOrder.filter(cat => groupedConfigs[cat]);

  // Find config name - check exact path match first, then try matching by filename (for URL params)
  const selectedConfigName = selectedConfig
    ? (configs.find(c => c.path === selectedConfig)?.name
       || configs.find(c => c.path.endsWith('/' + selectedConfig))?.name
       || selectedConfig.split('/').pop()?.replace('.yaml', '').replace('.json', '')
       || 'Selected')
    : 'Select Config';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Config Selector */}
      <div className="relative">
        <button
          onClick={() => {
            const newShowConfig = !showConfigDropdown;
            setShowConfigDropdown(newShowConfig);
            setShowSessionDropdown(false);
            if (!newShowConfig) setConfigSearch(''); // Clear search when closing
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
                   rounded-lg border border-gray-300 dark:border-gray-600 text-sm transition-colors"
        >
          <FolderOpen className="w-4 h-4 text-blue-400" />
          <span className="max-w-[140px] truncate">
            {loading ? 'Loading...' : selectedConfigName}
          </span>
          <ChevronDown className={`w-3 h-3 transition-transform ${showConfigDropdown ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {showConfigDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute right-0 mt-2 w-80 max-h-[400px] overflow-y-auto
                       bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50"
            >
              {/* Search Input */}
              <div className="p-2 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={configSearch}
                    onChange={(e) => setConfigSearch(e.target.value)}
                    placeholder="Search configs..."
                    className="w-full pl-9 pr-8 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600
                             rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  {configSearch && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfigSearch('');
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  )}
                </div>
                {/* View Config Button - under search */}
                {selectedConfig && (
                  <button
                    onClick={() => {
                      onViewConfig();
                      setShowConfigDropdown(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 mt-2 px-3 py-1.5 text-xs
                             text-gray-500 hover:text-gray-700 dark:hover:text-gray-300
                             bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                             border border-gray-300 dark:border-gray-600 rounded-lg transition-colors"
                  >
                    <Eye className="w-3 h-3" />
                    View Config File
                  </button>
                )}
              </div>

              {defaultConfig && !configSearch && (
                <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Default (from CLI)</div>
                  <button
                    onClick={() => {
                      onConfigChange(defaultConfig);
                      setShowConfigDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded text-sm truncate
                             ${selectedConfig === defaultConfig
                               ? 'bg-blue-600 text-white'
                               : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                  >
                    {configs.find(c => c.path === defaultConfig)?.name || defaultConfig}
                  </button>
                </div>
              )}

              {orderedCategories.map((category) => (
                <div key={category} className="p-2 border-b border-gray-200 dark:border-gray-700 last:border-0">
                  <div className="text-xs text-gray-500 mb-1 uppercase tracking-wide">
                    {category === 'root' ? 'General' : category === 'user' ? 'Your Config' : category}
                  </div>
                  {groupedConfigs[category].map((config) => (
                    <button
                      key={config.path}
                      onClick={() => {
                        onConfigChange(config.path);
                        setShowConfigDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded text-sm truncate
                               ${selectedConfig === config.path
                                 ? 'bg-blue-600 text-white'
                                 : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                      title={config.path}
                    >
                      {config.name}
                    </button>
                  ))}
                </div>
              ))}

              {filteredConfigs.length === 0 && !loading && (
                <div className="p-4 text-center text-gray-500 text-sm">
                  {configSearch ? `No configs matching "${configSearch}"` : 'No configs found'}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Session Selector */}
      <div className="relative">
        <button
          onClick={() => {
            const willOpen = !showSessionDropdown;
            setShowSessionDropdown(willOpen);
            setShowConfigDropdown(false);
            setConfigSearch(''); // Clear config search when opening sessions
            if (willOpen) setSessionIdInput(''); // Clear session input when opening
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
                   rounded-lg border border-gray-300 dark:border-gray-600 text-sm transition-colors"
        >
          <Users className="w-4 h-4 text-purple-400" />
          <span>Sessions ({sessions.length})</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${showSessionDropdown ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {showSessionDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute right-0 mt-2 w-80 max-h-[400px] overflow-y-auto
                       bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50"
            >
              {/* Session ID Input */}
              <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={sessionIdInput}
                    onChange={(e) => setSessionIdInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && sessionIdInput.trim()) {
                        onSessionChange(sessionIdInput.trim());
                        setShowSessionDropdown(false);
                        setSessionIdInput('');
                      }
                    }}
                    placeholder="Enter session ID..."
                    className="w-full pl-9 pr-8 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600
                             rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500
                             focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
                    onClick={(e) => e.stopPropagation()}
                  />
                  {sessionIdInput && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSessionIdInput('');
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  )}
                </div>
                {/* Autocomplete suggestions */}
                {sessionIdInput && (
                  <div className="mt-1 max-h-24 overflow-y-auto">
                    {sessions
                      .filter(s => s.session_id.toLowerCase().includes(sessionIdInput.toLowerCase()))
                      .slice(0, 3)
                      .map(s => (
                        <button
                          key={s.session_id}
                          onClick={() => {
                            onSessionChange(s.session_id);
                            setShowSessionDropdown(false);
                            setSessionIdInput('');
                          }}
                          className="w-full text-left px-3 py-1 text-xs font-mono text-gray-600 dark:text-gray-400
                                   hover:bg-gray-100 dark:hover:bg-gray-700 rounded truncate"
                        >
                          {s.session_id}
                        </button>
                      ))
                    }
                  </div>
                )}
              </div>

              {/* New Session Button */}
              <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    onNewSession();
                    setShowSessionDropdown(false);
                    // Refresh sessions after a short delay to pick up the new session
                    setTimeout(fetchSessions, 500);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm
                           bg-green-600 hover:bg-green-500 text-white transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Session
                </button>
              </div>

              {/* Active Sessions */}
              {sessions.filter(s => s.status === 'active' || s.is_running || s.connections > 0).length > 0 && (
                <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">Active Sessions</span>
                    <button
                      onClick={fetchSessions}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      title="Refresh"
                    >
                      <RefreshCw className="w-3 h-3 text-gray-500" />
                    </button>
                  </div>

                  {sessions
                    .filter(s => s.status === 'active' || s.is_running || s.connections > 0)
                    .map((session) => (
                      <button
                        key={session.session_id}
                        onClick={() => {
                          onSessionChange(session.session_id);
                          setShowSessionDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded text-sm mb-1
                                 ${currentSessionId === session.session_id
                                   ? 'bg-purple-600 text-white'
                                   : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs truncate max-w-[180px]">
                            {session.session_id.slice(0, 8)}...
                          </span>
                          <div className="flex items-center gap-2">
                            {session.is_running && (
                              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            )}
                            <span className="text-xs text-gray-400">
                              {session.connections} conn
                            </span>
                          </div>
                        </div>
                        {session.question && (
                          <div className="text-xs text-gray-400 truncate mt-1">
                            {session.question}
                          </div>
                        )}
                      </button>
                    ))
                  }
                </div>
              )}

              {/* Completed Sessions */}
              {sessions.filter(s => s.status === 'completed' && !s.is_running && s.connections === 0).length > 0 && (
                <div className="p-2">
                  <div className="text-xs text-gray-500 mb-2">Completed Sessions</div>
                  {sessions
                    .filter(s => s.status === 'completed' && !s.is_running && s.connections === 0)
                    .map((session) => (
                      <button
                        key={session.session_id}
                        onClick={() => {
                          onSessionChange(session.session_id);
                          setShowSessionDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded text-sm mb-1
                                 ${currentSessionId === session.session_id
                                   ? 'bg-purple-600 text-white'
                                   : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs truncate max-w-[180px]">
                            {session.session_id.slice(0, 8)}...
                          </span>
                          <span className="text-xs text-gray-400">
                            ✓ done
                          </span>
                        </div>
                        {session.question && (
                          <div className="text-xs text-gray-400 truncate mt-1">
                            {session.question}
                          </div>
                        )}
                      </button>
                    ))
                  }
                </div>
              )}

              {/* Empty state */}
              {sessions.length === 0 && (
                <div className="p-2 text-gray-500 text-sm text-center py-4">
                  No sessions
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Answers Browser */}
      <button
        onClick={onOpenAnswerBrowser}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
                 rounded-lg border border-gray-300 dark:border-gray-600 text-sm transition-colors"
        title="Browse Answers"
      >
        <FileText className="w-4 h-4 text-blue-500 dark:text-blue-400" />
        <span>Answers</span>
        {answerCount > 0 && (
          <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded-full text-xs min-w-[1.25rem] text-center">
            {answerCount}
          </span>
        )}
      </button>

      {/* Votes Browser */}
      <button
        onClick={onOpenVoteBrowser}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
                 rounded-lg border border-gray-300 dark:border-gray-600 text-sm transition-colors"
        title="Browse Votes"
      >
        <Vote className="w-4 h-4 text-amber-500 dark:text-amber-400" />
        <span>Votes</span>
        {voteCount > 0 && (
          <span className="px-1.5 py-0.5 bg-amber-600 text-white rounded-full text-xs min-w-[1.25rem] text-center">
            {voteCount}
          </span>
        )}
      </button>

      {/* Theme Toggle - icon only to save space */}
      <button
        onClick={cycleTheme}
        className="p-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
                 rounded-lg border border-gray-300 dark:border-gray-600 transition-colors"
        title={`Theme: ${themeMode} (click to cycle)`}
      >
        <ThemeIcon className="w-4 h-4 text-amber-500 dark:text-yellow-400" />
      </button>

      {/* Setup Page Button - left of Quickstart */}
      <a
        href="/setup"
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
                 rounded-lg border border-gray-300 dark:border-gray-600 text-sm transition-colors"
        title="Open Setup Page"
      >
        <Wrench className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        <span>Setup</span>
      </a>

      {/* Quickstart Wizard */}
      <button
        onClick={() => openWizard()}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-blue-500 to-purple-500
                 hover:from-blue-600 hover:to-purple-600 rounded-lg text-sm text-white transition-all"
        title="Open Quickstart Wizard"
      >
        <Wand2 className="w-4 h-4" />
        <span>Quickstart</span>
      </button>

      {/* Settings */}
      <button
        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        title="Settings"
      >
        <Settings className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      </button>
    </div>
  );
}

export default HeaderControls;
