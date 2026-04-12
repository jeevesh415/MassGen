/**
 * InlineAnswerBrowser Component
 *
 * Inline version of the answer/workspace browser for winner view.
 * Shows answers and workspace files in a tabbed interface.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, User, Clock, ChevronDown, Trophy, Folder, File, ChevronRight, RefreshCw, History, ExternalLink } from 'lucide-react';
import { useAgentStore, selectAnswers, selectAgentOrder, selectSelectedAgent } from '../stores/agentStore';
import type { Answer, AnswerWorkspace } from '../types';
import {
  getAgentWorkspaceLabel,
  getAnswerWorkspaceLabel,
} from '../utils/workspaceBrowser';

// Types for workspace API responses
interface WorkspaceInfo {
  name: string;
  path: string;
  type: 'current' | 'historical';
  date?: string;
  agentId?: string; // Which agent this workspace belongs to
}

interface WorkspacesResponse {
  current: WorkspaceInfo[];
  historical: WorkspaceInfo[];
}

interface AnswerWorkspacesResponse {
  workspaces: AnswerWorkspace[];
  current: WorkspaceInfo[];
}

// Map workspace name to agent ID (e.g., "workspace1" -> agent at index 0)
function getAgentIdFromWorkspace(workspaceName: string, agentOrder: string[]): string | undefined {
  const agentMatch = workspaceName.match(/agent_([a-z0-9_]+)/i);
  if (agentMatch) {
    const candidate = `agent_${agentMatch[1].toLowerCase()}`;
    if (agentOrder.includes(candidate)) {
      return candidate;
    }
  }

  const match = workspaceName.match(/workspace(\d+)/);
  if (match) {
    const index = parseInt(match[1], 10) - 1; // workspace1 = index 0
    return agentOrder[index];
  }
  return undefined;
}

interface FileInfo {
  path: string;
  size: number;
  modified: number;
}

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
  size?: number;
}

type TabType = 'answers' | 'workspace';

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildFileTree(files: FileInfo[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  files.forEach((file) => {
    const parts = file.path.split('/').filter(Boolean);
    let current = root;

    parts.forEach((part, idx) => {
      const isLast = idx === parts.length - 1;
      let node = current.find((n) => n.name === part);

      if (!node) {
        node = {
          name: part,
          path: parts.slice(0, idx + 1).join('/'),
          isDirectory: !isLast,
          children: [],
          size: isLast ? file.size : undefined,
        };
        current.push(node);
      }

      if (!isLast) {
        node.isDirectory = true;
        current = node.children;
      }
    });
  });

  // Sort: directories first, then files alphabetically
  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    }).map(node => ({
      ...node,
      children: sortNodes(node.children),
    }));
  };

  return sortNodes(root);
}

function FileNode({ node, depth }: { node: FileTreeNode; depth: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div>
      <div
        className={`
          flex items-center gap-1 py-1 px-2 hover:bg-gray-100 dark:hover:bg-gray-700/30 rounded cursor-pointer
          text-sm text-gray-700 dark:text-gray-300
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => node.isDirectory && setIsExpanded(!isExpanded)}
      >
        {node.isDirectory ? (
          isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )
        ) : (
          <span className="w-4" />
        )}

        {node.isDirectory ? (
          <Folder className="w-4 h-4 text-blue-400" />
        ) : (
          <File className="w-4 h-4 text-gray-400" />
        )}

        <span className="flex-1">{node.name}</span>

        {!node.isDirectory && node.size !== undefined && (
          <span className="text-xs text-gray-500">
            {formatFileSize(node.size)}
          </span>
        )}
      </div>

      <AnimatePresence>
        {node.isDirectory && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {node.children.map((child) => (
              <FileNode key={child.path} node={child} depth={depth + 1} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function InlineAnswerBrowser() {
  const answers = useAgentStore(selectAnswers);
  const agentOrder = useAgentStore(selectAgentOrder);
  const selectedAgent = useAgentStore(selectSelectedAgent);

  const [activeTab, setActiveTab] = useState<TabType>('answers');
  const [filterAgent, setFilterAgent] = useState<string | 'all'>('all');
  const [expandedAnswerId, setExpandedAnswerId] = useState<string | null>(null);

  // Workspace state - per agent
  const [workspaces, setWorkspaces] = useState<WorkspacesResponse>({ current: [], historical: [] });
  const [selectedAgentWorkspace, setSelectedAgentWorkspace] = useState<string | null>(null); // agent ID
  const [workspaceFiles, setWorkspaceFiles] = useState<FileInfo[]>([]);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  // Answer-linked workspace state
  const [answerWorkspaces, setAnswerWorkspaces] = useState<AnswerWorkspace[]>([]);
  const [selectedAnswerLabel, setSelectedAnswerLabel] = useState<string>('current');

  // Map workspaces to agents
  const workspacesByAgent = useMemo(() => {
    const map: Record<string, { current?: WorkspaceInfo; historical: WorkspaceInfo[] }> = {};

    // Initialize for all agents
    agentOrder.forEach(agentId => {
      map[agentId] = { historical: [] };
    });

    // Map current workspaces to agents
    workspaces.current.forEach(ws => {
      const agentId = getAgentIdFromWorkspace(ws.name, agentOrder);
      if (agentId && map[agentId]) {
        map[agentId].current = ws;
      }
    });

    // Map historical workspaces to agents
    workspaces.historical.forEach(ws => {
      // Historical workspace name is like "2024-01-15/workspace1"
      const parts = ws.name.split('/');
      const wsName = parts[parts.length - 1];
      const agentId = getAgentIdFromWorkspace(wsName, agentOrder);
      if (agentId && map[agentId]) {
        map[agentId].historical.push(ws);
      }
    });

    return map;
  }, [workspaces, agentOrder]);

  // Get the currently active workspace to display
  const activeWorkspace = useMemo(() => {
    if (selectedAgentWorkspace && selectedAnswerLabel !== 'current') {
      const answerWs = answerWorkspaces.find(
        (w) => w.agentId === selectedAgentWorkspace && w.answerLabel === selectedAnswerLabel
      );
      if (answerWs) {
        return {
          name: answerWs.answerLabel,
          path: answerWs.workspacePath,
          type: 'historical' as const,
        };
      }
    }
    if (selectedAgentWorkspace && workspacesByAgent[selectedAgentWorkspace]?.current) {
      return workspacesByAgent[selectedAgentWorkspace].current;
    }
    return null;
  }, [selectedAgentWorkspace, selectedAnswerLabel, answerWorkspaces, workspacesByAgent]);

  // Fetch available workspaces from API
  const fetchWorkspaces = useCallback(async () => {
    const sessionId = useAgentStore.getState().sessionId;
    setIsLoadingWorkspaces(true);
    setWorkspaceError(null);
    try {
      const url = sessionId
        ? `/api/workspaces?session_id=${encodeURIComponent(sessionId)}`
        : '/api/workspaces';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch workspaces');
      }
      const data: WorkspacesResponse = await response.json();
      setWorkspaces(data);

      // Auto-select first agent if none selected
      if (!selectedAgentWorkspace && agentOrder.length > 0) {
        setSelectedAgentWorkspace(agentOrder[0]);
      }
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      setIsLoadingWorkspaces(false);
    }
  }, [selectedAgentWorkspace, agentOrder]);

  // Fetch files for selected workspace
  const fetchWorkspaceFiles = useCallback(async (workspace: WorkspaceInfo) => {
    setIsLoadingFiles(true);
    setWorkspaceError(null);
    try {
      const response = await fetch(`/api/workspace/browse?path=${encodeURIComponent(workspace.path)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch workspace files');
      }
      const data = await response.json();
      setWorkspaceFiles(data.files || []);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Failed to load files');
      setWorkspaceFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  // Fetch answer-linked workspaces from API
  const fetchAnswerWorkspaces = useCallback(async () => {
    const sessionId = useAgentStore.getState().sessionId;
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/sessions/${sessionId}/answer-workspaces`);
      if (response.ok) {
        const data: AnswerWorkspacesResponse = await response.json();
        setAnswerWorkspaces(data.workspaces || []);
      }
    } catch (err) {
      console.error('Failed to fetch answer workspaces:', err);
    }
  }, []);

  // Open workspace in native file browser
  const openWorkspaceInFinder = useCallback(async (workspacePath: string) => {
    try {
      const response = await fetch('/api/workspace/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath }),
      });
      if (!response.ok) {
        const data = await response.json();
        setWorkspaceError(data.error || 'Failed to open workspace');
      }
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Failed to open workspace');
    }
  }, []);

  // Fetch workspaces when tab switches to workspace
  useEffect(() => {
    if (activeTab === 'workspace') {
      fetchWorkspaces();
      fetchAnswerWorkspaces();
    }
  }, [activeTab, fetchWorkspaces, fetchAnswerWorkspaces]);


  // Fetch files when workspace is selected
  useEffect(() => {
    if (activeWorkspace) {
      fetchWorkspaceFiles(activeWorkspace);
    }
  }, [activeWorkspace, fetchWorkspaceFiles]);

  // Filter answers
  const filteredAnswers = useMemo(() => {
    let result = [...answers];
    if (filterAgent !== 'all') {
      result = result.filter((a) => a.agentId === filterAgent);
    }
    return result.sort((a, b) => b.timestamp - a.timestamp);
  }, [answers, filterAgent]);

  // Group answers by agent
  const answersByAgent = useMemo(() => {
    const grouped: Record<string, Answer[]> = {};
    answers.forEach((answer) => {
      if (!grouped[answer.agentId]) {
        grouped[answer.agentId] = [];
      }
      grouped[answer.agentId].push(answer);
    });
    return grouped;
  }, [answers]);

  const fileTree = useMemo(() => buildFileTree(workspaceFiles), [workspaceFiles]);
  const totalWorkspaces = workspaces.current.length + answerWorkspaces.length;

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <button
          onClick={() => setActiveTab('answers')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'answers'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          Answers
          <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded-full text-xs">
            {answers.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('workspace')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'workspace'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <Folder className="w-4 h-4" />
          Workspace
          <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded-full text-xs">
            {totalWorkspaces}
          </span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'answers' ? (
          <div className="flex flex-col h-full">
            {/* Filter */}
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Filter:</span>
              <select
                value={filterAgent}
                onChange={(e) => setFilterAgent(e.target.value)}
                className="text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-gray-700 dark:text-gray-200"
              >
                <option value="all">All Agents</option>
                {agentOrder.map((agentId) => (
                  <option key={agentId} value={agentId}>
                    {agentId} ({answersByAgent[agentId]?.length || 0})
                  </option>
                ))}
              </select>
            </div>

            {/* Answer List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {filteredAnswers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-500">
                  <FileText className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No answers yet</p>
                </div>
              ) : (
                filteredAnswers.map((answer) => {
                  const isExpanded = expandedAnswerId === answer.id;
                  const isWinner = answer.agentId === selectedAgent;

                  return (
                    <div
                      key={answer.id}
                      className={`
                        bg-gray-50 dark:bg-gray-700/50 rounded border overflow-hidden cursor-pointer
                        transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/70
                        ${isWinner ? 'border-yellow-500/50' : 'border-gray-200 dark:border-gray-600'}
                      `}
                      onClick={() => setExpandedAnswerId(isExpanded ? null : answer.id)}
                    >
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-1 rounded ${isWinner ? 'bg-yellow-100 dark:bg-yellow-900/50' : 'bg-blue-100 dark:bg-blue-900/50'}`}>
                            {isWinner ? (
                              <Trophy className="w-3 h-3 text-yellow-500" />
                            ) : (
                              <User className="w-3 h-3 text-blue-500" />
                            )}
                          </div>
                          <div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{answer.agentId}</span>
                            <span className="text-xs text-gray-500 ml-1">#{answer.answerNumber}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimestamp(answer.timestamp)}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-gray-200 dark:border-gray-600"
                          >
                            <div className="p-3 bg-white dark:bg-gray-800/50">
                              <pre className="whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-300 font-mono max-h-48 overflow-y-auto">
                                {answer.content}
                              </pre>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Per-Agent Workspace Selector */}
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-2 flex-wrap">
              {/* Agent Selector */}
              <div className="flex items-center gap-1">
                <User className="w-3 h-3 text-blue-400" />
                <div className="flex gap-1">
                  {agentOrder.map((agentId) => {
                    const agentWs = workspacesByAgent[agentId];
                    const hasCurrent = !!agentWs?.current;
                    const hasHistorical = agentWs?.historical?.length > 0;

                    return (
                      <button
                        key={agentId}
                        onClick={() => {
                          setSelectedAgentWorkspace(agentId);
                          setSelectedAnswerLabel('current');
                          fetchWorkspaces();
                          fetchAnswerWorkspaces();
                        }}
                        disabled={!hasCurrent && !hasHistorical}
                        className={`px-2 py-0.5 text-xs rounded transition-colors ${
                          selectedAgentWorkspace === agentId
                            ? 'bg-blue-600 text-white'
                            : hasCurrent || hasHistorical
                              ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                        }`}
                        title={`${getAgentWorkspaceLabel(agentId, agentOrder)}${hasCurrent ? ' (live)' : ''}${hasHistorical ? ` + ${agentWs.historical.length} historical` : ''}`}
                      >
                        {getAgentWorkspaceLabel(agentId, agentOrder)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Answer Version Dropdown */}
              {selectedAgentWorkspace && (
                <div className="flex items-center gap-1">
                  <History className="w-3 h-3 text-amber-400" />
                  <select
                    value={selectedAnswerLabel}
                    onChange={(e) => {
                      const label = e.target.value;
                      setSelectedAnswerLabel(label);
                      // activeWorkspace effect will fetch the workspace files
                    }}
                    className="text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 text-gray-700 dark:text-gray-200"
                  >
                    <option value="current">Live</option>
                    {answerWorkspaces
                      .filter(w => w.agentId === selectedAgentWorkspace)
                      .sort((left, right) => (right.answerNumber || 0) - (left.answerNumber || 0))
                      .map((ws) => (
                        <option key={ws.answerId} value={ws.answerLabel}>
                          {getAnswerWorkspaceLabel(ws.answerNumber)}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Open in Finder button */}
              {activeWorkspace && (
                <button
                  onClick={() => openWorkspaceInFinder(activeWorkspace.path)}
                  className="ml-auto flex items-center gap-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs"
                  title="Open workspace in file browser"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Open</span>
                </button>
              )}

              <button
                onClick={() => {
                  fetchWorkspaces();
                  fetchAnswerWorkspaces();
                  if (activeWorkspace) fetchWorkspaceFiles(activeWorkspace);
                }}
                disabled={isLoadingWorkspaces || isLoadingFiles}
                className={`${!activeWorkspace ? 'ml-auto' : ''} p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-gray-500`}
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingWorkspaces || isLoadingFiles ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Error Display */}
            {workspaceError && (
              <div className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-xs">
                {workspaceError}
              </div>
            )}

            {/* File Tree */}
            <div className="flex-1 overflow-y-auto p-2">
              {isLoadingWorkspaces || isLoadingFiles ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <RefreshCw className="w-6 h-6 animate-spin mb-2" />
                  <p className="text-sm">Loading...</p>
                </div>
              ) : agentOrder.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Folder className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No agents found</p>
                </div>
              ) : !selectedAgentWorkspace ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Folder className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">Select an agent</p>
                </div>
              ) : !activeWorkspace ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Folder className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">
                    No workspace for {selectedAgentWorkspace ? getAgentWorkspaceLabel(selectedAgentWorkspace, agentOrder) : 'this agent'}
                  </p>
                </div>
              ) : workspaceFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Folder className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No files</p>
                </div>
              ) : (
                <div>
                  <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                    {selectedAgentWorkspace ? getAgentWorkspaceLabel(selectedAgentWorkspace, agentOrder) : 'Agent'}
                    {' - '}
                    {selectedAnswerLabel === 'current'
                      ? 'Live'
                      : getAnswerWorkspaceLabel(
                          answerWorkspaces.find((workspace) => workspace.answerLabel === selectedAnswerLabel)?.answerNumber ?? 0
                        )}
                    {' - '}
                    {workspaceFiles.length} files
                  </div>
                  {fileTree.map((node) => (
                    <FileNode key={node.path} node={node} depth={0} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default InlineAnswerBrowser;
