/**
 * AnswerBrowserModal Component
 *
 * Modal dialog for browsing all answers and workspace files from agents.
 * Includes tabs for Answers and Workspace views.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, User, Clock, ChevronDown, Trophy, Folder, ChevronRight, RefreshCw, History, Vote, ArrowRight, Eye, GitBranch, ExternalLink, Bell, Wifi, WifiOff, File, Columns } from 'lucide-react';
import { useAgentStore, selectAnswers, selectAgents, selectAgentOrder, selectSelectedAgent, selectFinalAnswer, selectVoteDistribution, selectVoteHistory, selectCurrentVotingRound, resolveAnswerContent } from '../stores/agentStore';
import { useWorkspaceStore, selectWsStatus, selectWsError } from '../stores/workspaceStore';
import type { Answer, AnswerWorkspace, TimelineNode as TimelineNodeType } from '../types';
import { ArtifactPreviewModal } from './ArtifactPreviewModal';
import { InlineArtifactPreview } from './InlineArtifactPreview';
import { TimelineView } from './timeline';
import { ProgressSummaryBar } from './ProgressSummaryBar';
import { EmptyState, EMPTY_STATES } from './EmptyState';
import { canPreviewFile } from '../utils/artifactTypes';
import { getFileIcon } from '../utils/fileIcons';
import { getAgentColor } from '../utils/agentColors';
import { clearFileCache } from '../hooks/useFileContent';
import { useModalKeyboardNavigation } from '../hooks/useModalKeyboardNavigation';
import { ComparisonView } from './ComparisonView';
import { ResizableSplitPane } from './ResizableSplitPane';
import { createAbortableFetch, isAbortError } from '../utils/fetchWithAbort';
import { debugLog } from '../utils/debugLogger';
import { getAnswerWorkspaceLabel } from '../utils/workspaceBrowser';
import { normalizePath } from '../utils/normalizePath';

// Types for workspace API responses
interface WorkspaceInfo {
  name: string;
  path: string;
  type: 'current' | 'historical';
  date?: string;
  agentId?: string;
}

interface WorkspacesResponse {
  current: WorkspaceInfo[];
  historical: WorkspaceInfo[];
}

interface AnswerWorkspacesResponse {
  workspaces: AnswerWorkspace[];
  current: WorkspaceInfo[];
  sources?: string[];
  log_dir_used?: string;
}

// Map workspace name to agent ID (e.g., "workspace1" -> agent at index 0)
function getAgentIdFromWorkspace(workspaceName: string, agentOrder: string[]): string | undefined {
  // Try agent_X pattern inside full path
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
  operation?: 'create' | 'modify' | 'delete';
}

interface BrowseResponse {
  files: FileInfo[];
  workspace_path: string;
  workspace_mtime?: number;
}

interface AnswerBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabType;
}

type TabType = 'answers' | 'votes' | 'workspace' | 'timeline';

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ============================================================================
// Workspace File Tree Components
// ============================================================================

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
  size?: number;
  modified?: number;
}

// Patterns for files/directories to hide in the workspace browser
const HIDDEN_FILE_PATTERNS = [
  /^\.mcp\//,           // MCP server config
  /^\.mcp$/,
  /^server\//,          // Backend server code
  /^servers\//,         // MCP servers directory
  /^servers$/,
  /^custom_tools\//,    // Custom tools directory
  /^custom_tools$/,
  /^massgen\//,         // MassGen internal directory
  /^massgen$/,
  /^node_modules\//,    // Node dependencies
  /^__pycache__\//,     // Python cache
  /^\.git\//,           // Git internals
  /^\.venv\//,          // Python virtual env
  /^venv\//,
  /^\.env$/,            // Environment files
  /^\.env\./,
  /\.pyc$/,             // Compiled Python
  /\.tmp$/,             // Temporary files
  /\.tmp\./,            // Temp files with extensions
];

// Filter out hidden/internal files from workspace
function filterHiddenFiles(files: FileInfo[]): FileInfo[] {
  return files.filter(file => {
    return !HIDDEN_FILE_PATTERNS.some(pattern => pattern.test(file.path));
  });
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
          modified: isLast ? file.modified : undefined,
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

interface FileNodeProps {
  node: FileTreeNode;
  depth: number;
  onFileClick?: (filePath: string) => void;
}

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileNode({ node, depth, onFileClick }: FileNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isPreviewable = !node.isDirectory && canPreviewFile(node.name);

  // Get file-type specific icon and color
  const fileIconConfig = !node.isDirectory ? getFileIcon(node.name) : null;
  const FileIcon = fileIconConfig?.icon;
  const fileIconClass = fileIconConfig?.className || 'text-gray-400';

  const handleClick = () => {
    if (node.isDirectory) {
      setIsExpanded(!isExpanded);
    } else if (onFileClick) {
      onFileClick(node.path);
    }
  };

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className={`
          flex items-center gap-1 py-1 px-2 hover:bg-gray-700/30 dark:hover:bg-gray-700/30 rounded cursor-pointer
          text-sm text-gray-700 dark:text-gray-300
          ${!node.isDirectory && onFileClick ? 'hover:bg-blue-900/30' : ''}
          ${isPreviewable ? 'text-violet-400' : ''}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
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
        ) : FileIcon ? (
          <FileIcon className={`w-4 h-4 ${isPreviewable ? 'text-violet-400' : fileIconClass}`} />
        ) : null}

        <span className="flex-1">{node.name}</span>

        {/* Preview icon for previewable files */}
        {isPreviewable && (
          <span title="Rich preview available">
            <Eye className="w-3.5 h-3.5 text-violet-400" />
          </span>
        )}

        {/* File size for non-directories */}
        {!node.isDirectory && node.size !== undefined && (
          <span className="text-xs text-gray-500 dark:text-gray-500">
            {formatFileSize(node.size)}
          </span>
        )}
      </motion.div>

      <AnimatePresence>
        {node.isDirectory && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {node.children.map((child) => (
              <FileNode key={child.path} node={child} depth={depth + 1} onFileClick={onFileClick} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// Main Modal Component
// ============================================================================

export function AnswerBrowserModal({ isOpen, onClose, initialTab = 'answers' }: AnswerBrowserModalProps) {
  const answers = useAgentStore(selectAnswers);
  const agents = useAgentStore(selectAgents);
  const agentOrder = useAgentStore(selectAgentOrder);
  const selectedAgent = useAgentStore(selectSelectedAgent);
  const finalAnswer = useAgentStore(selectFinalAnswer);
  const voteDistribution = useAgentStore(selectVoteDistribution);
  const voteHistory = useAgentStore(selectVoteHistory);
  const currentVotingRound = useAgentStore(selectCurrentVotingRound);
  const sessionId = useAgentStore((s) => s.sessionId);

  // Workspace store - always-on WebSocket provides real-time file updates
  const wsStatus = useWorkspaceStore(selectWsStatus);
  const wsError = useWorkspaceStore(selectWsError);
  const wsReconnectAttempts = useWorkspaceStore((s) => s.reconnectAttempts);
  const allWorkspaces = useWorkspaceStore((s) => s.workspaces);
  const historicalSnapshots = useWorkspaceStore((s) => s.historicalSnapshots);
  const getWorkspaceFiles = useWorkspaceStore((s) => s.getWorkspaceFiles);
  const getHistoricalFiles = useWorkspaceStore((s) => s.getHistoricalFiles);
  const setSnapshotFiles = useWorkspaceStore((s) => s.setSnapshotFiles);
  const refreshSessionFn = useWorkspaceStore((s) => s.refreshSessionFn);

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Update active tab when initialTab changes (e.g., opening from notification)
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);
  const [filterAgent, setFilterAgent] = useState<string | 'all'>('all');
  const [expandedAnswerId, setExpandedAnswerId] = useState<string | null>(null);

  // Auto-expand final answer when modal opens with answers tab
  useEffect(() => {
    if (isOpen && activeTab === 'answers' && !expandedAnswerId) {
      // Find the final answer (answerNumber === 0) and expand it
      const finalAnswerEntry = answers.find(a => a.answerNumber === 0);
      if (finalAnswerEntry) {
        setExpandedAnswerId(finalAnswerEntry.id);
      }
    }
  }, [isOpen, activeTab, answers, expandedAnswerId]);

  // Workspace state - API provides workspace info, store provides files
  const [workspaces, setWorkspaces] = useState<WorkspacesResponse>({ current: [], historical: [] });
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
  const [isLoadingHistoricalFiles, setIsLoadingHistoricalFiles] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [missingVersion, setMissingVersion] = useState<string | null>(null);
  const [logDirOverride, setLogDirOverride] = useState<string | null>(null);

  // Per-agent workspace selection state
  const [selectedAgentWorkspace, setSelectedAgentWorkspace] = useState<string | null>(null);

  // Answer-linked workspace state
  const [answerWorkspaces, setAnswerWorkspaces] = useState<AnswerWorkspace[]>([]);
  const [selectedAnswerLabel, setSelectedAnswerLabel] = useState<string>('current');

  // File viewer modal state
  const [fileViewerOpen, setFileViewerOpen] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);

  // Track if we've auto-previewed for the current workspace
  const hasAutoPreviewedRef = useRef<string | null>(null);
  // Track previous workspace path to detect changes
  const prevWorkspacePathRef = useRef<string | null>(null);

  // New answer notification state
  const [newAnswerNotification, setNewAnswerNotification] = useState<{
    answerLabel: string;  // Selection label for dropdown (e.g., "agent1.2")
    displayLabel: string; // Human-readable label (e.g., "Agent 1 Answer 2")
    agentId: string;
  } | null>(null);
  // Track per-agent answer counts for new answer detection
  // Value of -1 means "not yet initialized" (different from 0 answers)
  const lastKnownAgentAnswerCountRef = useRef<Record<string, number>>({});
  // Track previous selected agent to detect agent switches
  const prevSelectedAgentRef = useRef<string | null>(null);

  // AbortController ref for cancelling in-flight fetch requests (historical workspaces)
  const fetchAbortRef = useRef<(() => void) | null>(null);
  // Request ID to prevent stale finally blocks from clearing loading state
  const fetchRequestIdRef = useRef<number>(0);
  // Debounce ref to coalesce rapid new_answer events into single fetch
  const debouncedNewAnswerFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear workspace/browser state when session changes to avoid stale paths/files
  // Note: workspaceStore is cleared by useWorkspaceConnection when session changes
  useEffect(() => {
    setWorkspaces({ current: [], historical: [] });
    setSelectedAgentWorkspace(null);
    setSelectedFilePath('');
    setSelectedAnswerLabel('current');
    setWorkspaceError(null);
    setIsLoadingHistoricalFiles(false);
    setIsLoadingWorkspaces(false);
    hasAutoPreviewedRef.current = null;
    prevWorkspacePathRef.current = null;
    clearFileCache();
    setMissingVersion(null);
  }, [sessionId]);

  // Auto-select the final answer's workspace version when viewing a completed session
  // This ensures that when a session has ended and final answer exists, we show
  // the workspace from the winning agent's final answer, not "current" which may be empty
  useEffect(() => {
    debugLog.info('[HistoricalLoad] Auto-select effect running', {
      hasFinalAnswer: !!finalAnswer,
      selectedAgentWorkspace,
      selectedAnswerLabel,
      answersCount: answers.length,
    });

    if (!finalAnswer || !selectedAgentWorkspace || selectedAnswerLabel !== 'current') {
      debugLog.info('[HistoricalLoad] Auto-select skipped', {
        reason: !finalAnswer ? 'no finalAnswer' : !selectedAgentWorkspace ? 'no selectedAgentWorkspace' : 'not current',
      });
      return;
    }

    // Find the highest answer number for the selected agent (their final answer)
    const agentAnswers = answers.filter(a => a.agentId === selectedAgentWorkspace && a.answerNumber > 0);
    debugLog.info('[HistoricalLoad] Agent answers for auto-select', {
      selectedAgentWorkspace,
      agentAnswersCount: agentAnswers.length,
      answerNumbers: agentAnswers.map(a => a.answerNumber),
    });

    if (agentAnswers.length === 0) return;

    const latestAnswer = agentAnswers.reduce((latest, current) =>
      current.answerNumber > latest.answerNumber ? current : latest
    );

    // Compute the answer label for this agent's final answer
    const agentIdx = agentOrder.indexOf(selectedAgentWorkspace) + 1;
    const latestLabel = `agent${agentIdx}.${latestAnswer.answerNumber}`;

    debugLog.info('[HistoricalLoad] Auto-selecting final answer workspace', {
      selectedAgentWorkspace,
      latestAnswerNumber: latestAnswer.answerNumber,
      latestLabel,
    });

    setSelectedAnswerLabel(latestLabel);
  }, [finalAnswer, selectedAgentWorkspace, answers, agentOrder, selectedAnswerLabel]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debouncedNewAnswerFetchRef.current) {
        clearTimeout(debouncedNewAnswerFetchRef.current);
      }
    };
  }, []);

  // Read ?log_dir override from URL once
  useEffect(() => {
    const url = new URL(window.location.href);
    const logDir = url.searchParams.get('log_dir');
    if (logDir) {
      setLogDirOverride(logDir);
    }
  }, []);

  // Track new answers while on workspace tab - only for the agent being viewed
  // This effect detects new answers and sets a flag for workspace refresh
  // The actual fetch calls happen in a later effect after functions are defined
  const [pendingNewAnswerRefresh, setPendingNewAnswerRefresh] = useState(false);

  useEffect(() => {
    if (activeTab === 'workspace' && isOpen && selectedAgentWorkspace) {
      // Skip detection if this is a fresh agent selection (agent just changed)
      // The baseline will be set by the effect that runs right after, and we'll
      // start detecting from there. This prevents false notifications when switching agents.
      if (selectedAgentWorkspace !== prevSelectedAgentRef.current) {
        return;
      }

      // Filter answers to only the currently viewed agent
      const agentAnswers = answers.filter(a => a.agentId === selectedAgentWorkspace);
      const lastKnownCount = lastKnownAgentAnswerCountRef.current[selectedAgentWorkspace];
      const hasBaseline = lastKnownCount !== undefined && lastKnownCount >= 0;

      // Check if this agent has NEW answers since we started viewing
      // A baseline count of >= 0 means we've been tracking, so we should notify on increase
      // This handles first answer (0 -> 1) as well as subsequent answers
      if (hasBaseline && agentAnswers.length > lastKnownCount) {
        // Set flag to trigger workspace refresh in later effect
        setPendingNewAnswerRefresh(true);

        // Show notification for ALL views (current AND historical) per FR-015
        // This ensures users are always aware of new answers and can navigate to them
        const newestAnswer = [...agentAnswers].sort((a, b) => b.timestamp - a.timestamp)[0];
        if (newestAnswer) {
          const agentIdx = agentOrder.indexOf(selectedAgentWorkspace) + 1;
          // Store both display label and selection label (used by version dropdown)
          const displayLabel = newestAnswer.answerNumber === 0
            ? 'Final Answer'
            : `Agent ${agentIdx} Answer ${newestAnswer.answerNumber}`;
          const selectionLabel = `agent${agentIdx}.${newestAnswer.answerNumber}`;

          setNewAnswerNotification({
            answerLabel: selectionLabel,
            displayLabel,
            agentId: selectedAgentWorkspace,
          });
        }
      }

      // Update tracking for this agent
      lastKnownAgentAnswerCountRef.current[selectedAgentWorkspace] = agentAnswers.length;
    }
  }, [answers, activeTab, isOpen, agentOrder, selectedAgentWorkspace, selectedAnswerLabel]);

  // Initialize answer count when agent selection changes
  // Reset baseline when switching to a different agent to prevent false notifications
  useEffect(() => {
    if (selectedAgentWorkspace && selectedAgentWorkspace !== prevSelectedAgentRef.current) {
      // Agent changed - establish a new baseline
      const currentCount = answers.filter(a => a.agentId === selectedAgentWorkspace).length;
      lastKnownAgentAnswerCountRef.current[selectedAgentWorkspace] = currentCount;
      prevSelectedAgentRef.current = selectedAgentWorkspace;
    }
  }, [selectedAgentWorkspace, answers]);

  // Clear notification when user manually changes agent or version selection
  useEffect(() => {
    setNewAnswerNotification(null);
  }, [selectedAgentWorkspace, selectedAnswerLabel]);

  // Handle notification actions - navigate to current workspace or stay in historical
  const handleMoveToCurrentWorkspace = useCallback(() => {
    if (newAnswerNotification) {
      // Navigate to the current workspace (where the new answer was produced)
      setSelectedAnswerLabel('current');
      // Clear file selection to trigger auto-preview of new content
      setSelectedFilePath('');
      // Dismiss the notification
      setNewAnswerNotification(null);
    }
  }, [newAnswerNotification]);

  const handleStayInHistorical = useCallback(() => {
    if (newAnswerNotification) {
      // Navigate to the new historical snapshot (what was "current" before the answer)
      // This is the workspace state we were viewing before it got cleared
      setSelectedAnswerLabel(newAnswerNotification.answerLabel);
      // Clear file selection since we're switching workspaces
      setSelectedFilePath('');
    }
    // Dismiss the notification
    setNewAnswerNotification(null);
  }, [newAnswerNotification]);

  // Handle file click from workspace browser - sets file for inline preview
  const handleFileClick = useCallback((filePath: string) => {
    setSelectedFilePath(filePath);
    // Don't open modal - use inline preview in workspace tab
  }, []);

  // Handle closing inline preview
  const handleInlinePreviewClose = useCallback(() => {
    setSelectedFilePath('');
  }, []);

  // Handle preview close for modal (used by other tabs)
  const handlePreviewClose = useCallback(() => {
    setFileViewerOpen(false);
  }, []);

  // Handle timeline node click - navigate to appropriate tab
  const handleTimelineNodeClick = useCallback((node: TimelineNodeType) => {
    if (node.type === 'answer' || node.type === 'final') {
      // Switch to answers tab and expand the matching answer
      setActiveTab('answers');
      // Find and expand the answer that matches this node's label
      const matchingAnswer = answers.find(a => {
        // Match by agent ID and answer number
        const agentIdx = agentOrder.indexOf(a.agentId) + 1;
        const expectedLabel = a.answerNumber === 0
          ? 'final'
          : `agent${agentIdx}.${a.answerNumber}`;
        return node.label === expectedLabel || node.label === `answer${agentIdx}.${a.answerNumber}`;
      });
      if (matchingAnswer) {
        setExpandedAnswerId(matchingAnswer.id);
      }
    } else if (node.type === 'vote') {
      // Switch to votes tab
      setActiveTab('votes');
    }
  }, [answers, agentOrder]);

  // Fetch available workspaces from API (reads status.json - should be instant)
  const fetchWorkspaces = useCallback(async () => {
    setIsLoadingWorkspaces(true);
    setWorkspaceError(null);

    try {
      // Pass session_id for fast lookup from status.json
      const url = sessionId
        ? `/api/workspaces?session_id=${encodeURIComponent(sessionId)}`
        : '/api/workspaces';
      const response = await fetch(url);

      if (!response.ok) {
        // Handle status.json unavailable specifically (FR-011, T021)
        if (response.status === 503) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Workspace info not yet available. Session may still be initializing.');
        }
        throw new Error(`Failed to fetch workspaces (${response.status})`);
      }
      const data: WorkspacesResponse = await response.json();
      setWorkspaces(data);

      // Auto-select first agent's workspace if available
      if (data.current.length > 0 && !selectedAgentWorkspace) {
        const firstWorkspace = data.current[0];
        // Use agentId from API response if available (fast path), otherwise fall back to heuristic
        const agentId = firstWorkspace.agentId || getAgentIdFromWorkspace(firstWorkspace.name, agentOrder);
        if (agentId) {
          setSelectedAgentWorkspace(agentId);
        }
      } else if (data.current.length === 0 && !selectedAgentWorkspace) {
        // No current workspaces - try to use historical workspaces for completed sessions
        if (data.historical.length > 0) {
          // For completed sessions, select the first agent with historical workspaces
          const firstHistorical = data.historical[0];
          const agentId = firstHistorical.agentId || getAgentIdFromWorkspace(firstHistorical.name, agentOrder);
          if (agentId) {
            setSelectedAgentWorkspace(agentId);
          }
        } else {
          // Clear selection only if no workspaces exist at all
          setSelectedFilePath('');
          hasAutoPreviewedRef.current = null;
        }
      }
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      setIsLoadingWorkspaces(false);
    }
  }, [selectedAgentWorkspace, agentOrder, sessionId]);

  // Fetch files for historical workspace (current workspaces use WebSocket via store)
  // Historical workspace files are static - fetch once and store in snapshot
  const fetchHistoricalFiles = useCallback(async (answerLabel: string, workspacePath: string) => {
    debugLog.info('[Modal] fetchHistoricalFiles called', { answerLabel, workspacePath });

    // Cancel any in-flight request before starting a new one
    if (fetchAbortRef.current) {
      fetchAbortRef.current();
      fetchAbortRef.current = null;
    }

    // Increment request ID to track this specific request
    const requestId = ++fetchRequestIdRef.current;

    setIsLoadingHistoricalFiles(true);
    setWorkspaceError(null);

    const { promise, abort } = createAbortableFetch<BrowseResponse>(
      `/api/workspace/browse?path=${encodeURIComponent(workspacePath)}`,
      { timeout: 30000 }
    );

    fetchAbortRef.current = abort;

    try {
      const data = await promise;
      debugLog.info('[Modal] fetchHistoricalFiles response', {
        answerLabel,
        workspacePath,
        responseWorkspacePath: data.workspace_path,
        fileCount: data.files?.length ?? 0,
      });
      // Verify this response is for the currently requested workspace
      if (data.workspace_path !== workspacePath) {
        debugLog.warn('[Modal] fetchHistoricalFiles path mismatch', {
          expected: workspacePath,
          got: data.workspace_path,
        });
        return;
      }
      // Only update state if this is still the current request
      if (requestId === fetchRequestIdRef.current) {
        // Store files in the workspace store's historical snapshot
        setSnapshotFiles(answerLabel, data.files || []);
        debugLog.info('[Modal] fetchHistoricalFiles stored files', {
          answerLabel,
          fileCount: data.files?.length ?? 0,
        });
      }
    } catch (err) {
      if (isAbortError(err)) {
        debugLog.info('[Modal] fetchHistoricalFiles aborted', { answerLabel });
        return;
      }
      debugLog.error('[Modal] fetchHistoricalFiles error', {
        answerLabel,
        error: err instanceof Error ? err.message : String(err),
      });
      if (requestId === fetchRequestIdRef.current) {
        setWorkspaceError(err instanceof Error ? err.message : 'Failed to load files');
      }
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setIsLoadingHistoricalFiles(false);
        fetchAbortRef.current = null;
      }
    }
  }, [setSnapshotFiles]);

  // Fetch answer-linked workspaces from API
  const fetchAnswerWorkspaces = useCallback(async () => {
    const sessionId = useAgentStore.getState().sessionId;
    if (!sessionId) return;
    try {
      const params = new URLSearchParams();
      if (logDirOverride) {
        params.set('log_dir', logDirOverride);
      }
      const response = await fetch(`/api/sessions/${sessionId}/answer-workspaces?${params.toString()}`);
      if (response.ok) {
        const data: AnswerWorkspacesResponse = await response.json();
        setAnswerWorkspaces(data.workspaces || []);
      }
    } catch (err) {
      console.error('Failed to fetch answer workspaces:', err);
    }
  }, [logDirOverride]);

  // CRITICAL FIX: Handle pending new answer refresh with debouncing
  // This effect runs when a new answer is detected and triggers workspace sync
  // Debouncing coalesces rapid new_answer events into a single fetch to prevent cascade
  // NOTE: fetchAnswerWorkspaces removed - new answers now include workspace_path via WebSocket
  useEffect(() => {
    if (pendingNewAnswerRefresh) {
      // Reset the flag first to prevent loops
      setPendingNewAnswerRefresh(false);

      // Clear selected file to prevent showing stale "file not found" errors
      // The file list will update shortly and user can select a new file
      setSelectedFilePath('');

      // Debounce to coalesce rapid new_answer events into single fetch
      if (debouncedNewAnswerFetchRef.current) {
        clearTimeout(debouncedNewAnswerFetchRef.current);
      }
      debouncedNewAnswerFetchRef.current = setTimeout(() => {
        // Refresh the current workspaces in case they changed
        fetchWorkspaces();
        // Also refresh file list via WebSocket to get updated files immediately
        if (refreshSessionFn) {
          refreshSessionFn();
        }
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNewAnswerRefresh]);

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

  // Map workspaces to agents
  const workspacesByAgent = useMemo(() => {
    const map: Record<string, { current?: WorkspaceInfo; historical: WorkspaceInfo[] }> = {};

    // Initialize for all agents
    agentOrder.forEach((agentId) => {
      map[agentId] = { historical: [] };
    });

    // Map current workspaces - use agentId from API if available, otherwise fall back to heuristic
    workspaces.current.forEach((ws) => {
      const agentId = ws.agentId || getAgentIdFromWorkspace(ws.name, agentOrder);
      if (agentId && map[agentId]) {
        map[agentId].current = ws;
      }
    });

    // Map historical workspaces
    workspaces.historical.forEach((ws) => {
      const agentId = ws.agentId || getAgentIdFromWorkspace(ws.name, agentOrder);
      if (agentId && map[agentId]) {
        map[agentId].historical.push(ws);
      }
    });

    return map;
  }, [workspaces, agentOrder]);

  // Compute active workspace to display
  const activeWorkspace = useMemo(() => {
    if (!selectedAgentWorkspace) return null;

    // If a historical answer version is selected, get workspace path
    if (selectedAnswerLabel !== 'current') {
      // Check answerWorkspaces FIRST (from HTTP API via status.json, always has correct absolute paths)
      const answerWs = answerWorkspaces.find(
        (w) => w.agentId === selectedAgentWorkspace && w.answerLabel === selectedAnswerLabel
      );
      if (answerWs) {
        setMissingVersion(null);
        return {
          name: answerWs.answerLabel,
          path: answerWs.workspacePath,
          type: 'historical' as const,
        };
      }

      // Fallback to answers from agentStore (has workspace_path from new_answer WebSocket event)
      const agentIdx = agentOrder.indexOf(selectedAgentWorkspace) + 1;
      const matchingAnswer = answers.find(a => {
        const expectedLabel = `agent${agentIdx}.${a.answerNumber}`;
        return a.agentId === selectedAgentWorkspace && expectedLabel === selectedAnswerLabel;
      });

      if (matchingAnswer?.workspacePath) {
        setMissingVersion(null);
        return {
          name: selectedAnswerLabel,
          path: matchingAnswer.workspacePath,
          type: 'historical' as const,
        };
      }

      // Selected a version but no mapping yet; avoid falling back to current
      setMissingVersion(`Workspace for version "${selectedAnswerLabel}" not available yet`);
      return null;
    }
    setMissingVersion(null);

    // Fallback to current workspace for the agent
    return workspacesByAgent[selectedAgentWorkspace]?.current || null;
  }, [selectedAgentWorkspace, selectedAnswerLabel, answers, answerWorkspaces, workspacesByAgent, agentOrder]);

  // Fetch workspaces when modal opens or tab switches to workspace
  // Note: fetchWorkspaces excluded from deps to prevent refetch cascade
  // FIX: Also fetch answerWorkspaces eagerly - WebSocket new_answer events may not always include workspace_path
  // The HTTP API reads from status.json which always has correct absolute paths
  useEffect(() => {
    if (isOpen && activeTab === 'workspace') {
      fetchWorkspaces();
      fetchAnswerWorkspaces(); // Always fetch historical workspace mappings from status.json
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab, sessionId]);

  // Check if current workspace files are missing from store and trigger refresh ONCE
  // This handles the case where WebSocket connected before status.json was ready
  const hasRefreshedForMissingRef = useRef(false);
  useEffect(() => {
    // Reset the guard when modal closes
    if (!isOpen) {
      hasRefreshedForMissingRef.current = false;
      return;
    }

    if (activeTab !== 'workspace') {
      return;
    }

    // Only check once per modal open to prevent infinite loops
    if (hasRefreshedForMissingRef.current) {
      return;
    }

    // Check if any current workspace paths are missing from the store
    const missingPaths = workspaces.current.filter(
      (ws) => {
        const storeData = allWorkspaces[ws.path];
        return !storeData || storeData.files.length === 0;
      }
    );

    if (missingPaths.length > 0 && refreshSessionFn) {
      hasRefreshedForMissingRef.current = true;
      refreshSessionFn();
    }
  }, [isOpen, activeTab, workspaces.current, allWorkspaces, refreshSessionFn]);

  // Poll for file updates every 3 seconds when viewing CURRENT workspace
  // Historical workspaces are snapshots and don't need polling
  useEffect(() => {
    // Only poll when modal is open, workspace tab is active, and we have refresh function
    if (!isOpen || activeTab !== 'workspace' || !refreshSessionFn || !activeWorkspace) {
      return;
    }

    // Skip polling for historical workspaces - they don't change
    if (activeWorkspace.type === 'historical') {
      return;
    }

    const pollInterval = setInterval(() => {
      refreshSessionFn();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [isOpen, activeTab, refreshSessionFn, activeWorkspace]);

  // FIX: Removed hasFetchedAnswerWorkspacesRef guard - answerWorkspaces is now fetched eagerly on tab open
  // This fallback effect triggers refetch if a version is selected but not found in answerWorkspaces
  // This handles edge cases where the initial fetch didn't include this version (e.g., answer created after fetch)
  useEffect(() => {
    if (missingVersion && answerWorkspaces.length === 0) {
      fetchAnswerWorkspaces();
    }
  }, [missingVersion, answerWorkspaces.length, fetchAnswerWorkspaces]);


  // Track previous workspace path to detect actual changes
  // For historical workspaces, fetch files if not already cached in store
  useEffect(() => {
    const currentPath = activeWorkspace?.path || null;
    const pathChanged = prevWorkspacePathRef.current !== currentPath;

    if (activeWorkspace && pathChanged) {
      prevWorkspacePathRef.current = currentPath;
      // Clear the selected file path when workspace actually changes
      setSelectedFilePath('');
      // Reset auto-preview tracking for this new workspace
      hasAutoPreviewedRef.current = null;
    } else if (!activeWorkspace && prevWorkspacePathRef.current !== null) {
      prevWorkspacePathRef.current = null;
      setSelectedFilePath('');
    }

    // For historical workspaces, always check if we need to fetch files
    // This runs on every render where we have an activeWorkspace + historical label
    // because the answer label might change without the path changing
    if (activeWorkspace && selectedAnswerLabel !== 'current') {
      const historicalFiles = getHistoricalFiles(selectedAnswerLabel);
      debugLog.info('[HistoricalLoad] Decision point in useEffect', {
        selectedAnswerLabel,
        historicalFilesIsNull: historicalFiles === null,
        willFetch: historicalFiles === null,
      });
      if (historicalFiles === null) {
        // Need to fetch - files not in store yet
        fetchHistoricalFiles(selectedAnswerLabel, activeWorkspace.path);
      }
    }
  }, [activeWorkspace, selectedAnswerLabel, getHistoricalFiles, fetchHistoricalFiles]);

  // FIX: Eagerly fetch historical files when answerWorkspaces arrives and we have a pending historical selection
  // This handles the race condition where the version dropdown is selected before answerWorkspaces is fetched
  useEffect(() => {
    if (selectedAnswerLabel === 'current' || !selectedAgentWorkspace) return;

    // Check if we can now find the workspace in answerWorkspaces
    const answerWs = answerWorkspaces.find(
      (w) => w.agentId === selectedAgentWorkspace && w.answerLabel === selectedAnswerLabel
    );

    if (answerWs) {
      // answerWorkspaces now has this version - fetch files if not already cached
      const historicalFiles = getHistoricalFiles(selectedAnswerLabel);
      if (historicalFiles === null) {
        fetchHistoricalFiles(selectedAnswerLabel, answerWs.workspacePath);
      }
    }
  }, [answerWorkspaces, selectedAnswerLabel, selectedAgentWorkspace, getHistoricalFiles, fetchHistoricalFiles]);

  // Compute workspace files from store (replaces local state)
  // - Current workspaces: files come from WebSocket via workspaceStore
  // - Historical workspaces: files come from HTTP fetch, stored in historicalSnapshots
  const workspaceFiles = useMemo((): FileInfo[] => {
    if (!activeWorkspace) return [];

    if (selectedAnswerLabel !== 'current') {
      // Historical workspace - get from snapshot store
      const historicalFiles = getHistoricalFiles(selectedAnswerLabel);
      return historicalFiles || [];
    } else {
      // Current workspace - get from live workspace store
      return getWorkspaceFiles(activeWorkspace.path);
    }
  }, [activeWorkspace, selectedAnswerLabel, getHistoricalFiles, getWorkspaceFiles, allWorkspaces, historicalSnapshots, wsStatus]);

  // Determine loading state
  const isLoadingFiles = useMemo(() => {
    if (!activeWorkspace) return false;

    if (selectedAnswerLabel !== 'current') {
      // Historical: loading if we're fetching OR if files are null (not yet loaded)
      const historicalFiles = getHistoricalFiles(selectedAnswerLabel);
      return isLoadingHistoricalFiles || historicalFiles === null;
    } else {
      // Current: WebSocket always provides files - check if workspace exists in store
      const wsData = allWorkspaces[normalizePath(activeWorkspace.path)];
      // Loading if connected but no workspace data yet
      return wsStatus === 'connecting' || (wsStatus === 'connected' && !wsData);
    }
  }, [activeWorkspace, selectedAnswerLabel, getHistoricalFiles, isLoadingHistoricalFiles, allWorkspaces, wsStatus]);

  // NOTE: Polling removed - now using WebSocket for real-time updates (T030)
  // WebSocket provides <2s update latency vs 8s polling

  // Auto-preview: Select first previewable file when workspace files are loaded
  // Use filtered files to avoid selecting hidden/temp files
  useEffect(() => {
    // Only auto-preview when:
    // 1. We have files
    // 2. No file is already selected
    // 3. We haven't auto-previewed this workspace yet
    const workspaceKey = activeWorkspace?.path || '';
    const visibleFiles = filterHiddenFiles(workspaceFiles);

    if (
      visibleFiles.length > 0 &&
      !selectedFilePath &&
      activeTab === 'workspace' &&
      hasAutoPreviewedRef.current !== workspaceKey
    ) {
      // Find the "main" previewable file with priority:
      // 1. PDF (specialized document)
      // 2. PPTX (specialized document)
      // 3. DOCX (specialized document)
      // 4. index.html (web entry point)
      // 5. Any .html file
      // 6. Images
      // 7. Any other previewable file
      const findMainPreviewable = (): string | null => {
        const previewableFiles = visibleFiles.filter(f => canPreviewFile(f.path));
        if (previewableFiles.length === 0) return null;

        // Priority 1: PDF
        const pdf = previewableFiles.find(f =>
          f.path.toLowerCase().endsWith('.pdf')
        );
        if (pdf) return pdf.path;

        // Priority 2: PPTX
        const pptx = previewableFiles.find(f =>
          f.path.toLowerCase().endsWith('.pptx')
        );
        if (pptx) return pptx.path;

        // Priority 3: DOCX
        const docx = previewableFiles.find(f =>
          f.path.toLowerCase().endsWith('.docx')
        );
        if (docx) return docx.path;

        // Priority 4: index.html
        const indexHtml = previewableFiles.find(f =>
          f.path.toLowerCase().endsWith('index.html')
        );
        if (indexHtml) return indexHtml.path;

        // Priority 5: Any HTML file
        const anyHtml = previewableFiles.find(f =>
          f.path.toLowerCase().endsWith('.html') || f.path.toLowerCase().endsWith('.htm')
        );
        if (anyHtml) return anyHtml.path;

        // Priority 6: Images
        const image = previewableFiles.find(f => {
          const ext = f.path.toLowerCase();
          return ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') ||
                 ext.endsWith('.gif') || ext.endsWith('.svg') || ext.endsWith('.webp');
        });
        if (image) return image.path;

        // Priority 7: First previewable file
        return previewableFiles[0].path;
      };

      const mainFile = findMainPreviewable();
      if (mainFile) {
        hasAutoPreviewedRef.current = workspaceKey;
        setSelectedFilePath(mainFile);
      }
    }
  }, [workspaceFiles, selectedFilePath, activeTab, activeWorkspace]);

  // Filter answers based on selected agent
  const filteredAnswers = useMemo(() => {
    let result = [...answers];

    if (filterAgent !== 'all') {
      result = result.filter((a) => a.agentId === filterAgent);
    }

    return result.sort((a, b) => b.timestamp - a.timestamp);
  }, [answers, filterAgent]);

  // Group answers by agent for summary stats
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

  // Collect vote data from voteHistory - permanent record that survives round resets
  const votes = useMemo(() => {
    return voteHistory.map((record) => {
      const voterIdx = agentOrder.indexOf(record.voterId);
      const targetIdx = agentOrder.indexOf(record.targetId);
      const voterAgent = agents[record.voterId];
      const targetAgent = agents[record.targetId];

      // Find what answers were available to choose from at the time of this vote
      // This is approximate - we use the votedAnswerLabel's answer number as the baseline
      const voteAnswerNum = parseInt(record.votedAnswerLabel?.match(/\.(\d+)$/)?.[1] || '1', 10);
      const availableAnswers = agentOrder.map((_, idx) => `answer${idx + 1}.${voteAnswerNum}`);

      // Check if this vote is from the current voting round (valid) or a previous round (invalidated)
      const isValid = record.voteRound === currentVotingRound;

      return {
        voterId: record.voterId,
        voterIndex: voterIdx + 1,
        voterModel: voterAgent?.modelName,
        targetId: record.targetId,
        targetIndex: targetIdx + 1,
        targetModel: targetAgent?.modelName,
        votedAnswerLabel: record.votedAnswerLabel || `answer${targetIdx + 1}.1`,
        availableAnswers,
        reason: record.reason || 'No reason provided',
        isValid,
        voteRound: record.voteRound,
        timestamp: record.timestamp,
      };
    }).sort((a, b) => b.timestamp - a.timestamp);  // Newest first (top-down chronological)
  }, [voteHistory, agents, agentOrder, currentVotingRound]);

  // Sort vote distribution by votes (highest first)
  const sortedDistribution = useMemo(() => {
    return Object.entries(voteDistribution)
      .sort(([, a], [, b]) => b - a)
      .map(([agentId, voteCount]) => {
        const idx = agentOrder.indexOf(agentId);
        return {
          agentId,
          agentIndex: idx + 1,
          modelName: agents[agentId]?.modelName,
          votes: voteCount,
          isWinner: agentId === selectedAgent,
        };
      });
  }, [voteDistribution, agents, agentOrder, selectedAgent]);

  // Filter out hidden/internal directories from workspace files
  const filteredWorkspaceFiles = useMemo(() => filterHiddenFiles(workspaceFiles), [workspaceFiles]);

  // Build file tree from filtered workspace files
  const fileTree = useMemo(() => buildFileTree(filteredWorkspaceFiles), [filteredWorkspaceFiles]);

  // Count total workspaces
  const totalWorkspaces = workspaces.current.length + answerWorkspaces.length;

  // Compute item counts for keyboard navigation
  const itemCountByTab = useMemo(() => ({
    answers: filteredAnswers.length,
    votes: votes.length,
    workspace: fileTree.length,
    timeline: 0, // Timeline uses its own navigation
  }), [filteredAnswers.length, votes.length, fileTree.length]);

  // Keyboard navigation within modal
  // Note: selectedIndex and isNavigating can be used for visual highlighting
  const {
    selectedIndex: _selectedIndex,
    isNavigating: _isNavigating,
    setSelectedIndex: _setSelectedIndex,
  } = useModalKeyboardNavigation({
    isOpen,
    activeTab,
    itemCount: itemCountByTab[activeTab],
    onTabChange: setActiveTab,
    onItemSelect: (index) => {
      // Handle item selection based on active tab
      if (activeTab === 'answers' && filteredAnswers[index]) {
        setExpandedAnswerId(filteredAnswers[index].id);
      }
    },
    onItemActivate: (index) => {
      // Handle Enter/Space on selected item
      if (activeTab === 'answers' && filteredAnswers[index]) {
        const answerId = filteredAnswers[index].id;
        setExpandedAnswerId(expandedAnswerId === answerId ? null : answerId);
      }
    },
    onClose,
  });

  // Compute progress summary values
  const isVoting = useMemo(() => {
    return votes.length > 0 && !selectedAgent;
  }, [votes.length, selectedAgent]);

  const isComplete = useMemo(() => {
    return !!selectedAgent || !!finalAnswer;
  }, [selectedAgent, finalAnswer]);

  const winnerVotes = useMemo(() => {
    if (!selectedAgent) return undefined;
    return voteDistribution[selectedAgent] || 0;
  }, [selectedAgent, voteDistribution]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-4 md:inset-6 lg:inset-8 bg-gray-800 rounded-xl border border-gray-600 shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-900/50">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-blue-400" />
                <h2 className="text-xl font-semibold text-gray-100">Browser</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-700 bg-gray-800/50">
              <button
                onClick={() => setActiveTab('answers')}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'answers'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <FileText className="w-4 h-4" />
                Answers
                <span className="px-1.5 py-0.5 bg-gray-700 rounded-full text-xs">
                  {answers.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('votes')}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'votes'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <Vote className="w-4 h-4" />
                Votes
                <span className="px-1.5 py-0.5 bg-gray-700 rounded-full text-xs">
                  {votes.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('workspace')}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'workspace'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <Folder className="w-4 h-4" />
                Workspace
                <span className="px-1.5 py-0.5 bg-gray-700 rounded-full text-xs">
                  {totalWorkspaces}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('timeline')}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'timeline'
                    ? 'border-green-500 text-green-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <GitBranch className="w-4 h-4" />
                Timeline
              </button>

              {/* Progress Summary Bar - right-aligned */}
              <div className="ml-auto flex items-center pr-4">
                <ProgressSummaryBar
                  agentCount={agentOrder.length}
                  answerCount={answers.length}
                  voteCount={votes.length}
                  totalVotesExpected={agentOrder.length}
                  winnerId={selectedAgent || undefined}
                  winnerVotes={winnerVotes}
                  isComplete={isComplete}
                  isVoting={isVoting}
                  agentOrder={agentOrder}
                />
              </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'answers' ? (
              <>
                {/* Filter Bar */}
                <div className="px-6 py-3 border-b border-gray-700 bg-gray-800/50 flex items-center gap-4">
                  <span className="text-sm text-gray-400">Filter by agent:</span>
                  <div className="relative">
                    <select
                      value={filterAgent}
                      onChange={(e) => setFilterAgent(e.target.value)}
                      className="appearance-none bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 pr-10 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Agents</option>
                      {agentOrder.map((agentId) => (
                        <option key={agentId} value={agentId}>
                          {agentId} ({answersByAgent[agentId]?.length || 0} answers)
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Answer List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                  {filteredAnswers.length === 0 ? (
                    <EmptyState
                      icon={FileText}
                      title={EMPTY_STATES.noAnswers.title}
                      description={EMPTY_STATES.noAnswers.description}
                      hint={EMPTY_STATES.noAnswers.hint}
                    />
                  ) : (
                    <div className="space-y-3">
                      {filteredAnswers.map((answer) => {
                        const isExpanded = expandedAnswerId === answer.id;
                        const isWinner = answer.agentId === selectedAgent;

                        return (
                          <motion.div
                            key={answer.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`
                              bg-gray-700/50 rounded-lg border overflow-hidden cursor-pointer
                              transition-colors hover:bg-gray-700/70
                              ${isWinner ? 'border-yellow-500/50' : 'border-gray-600'}
                            `}
                            onClick={() => setExpandedAnswerId(isExpanded ? null : answer.id)}
                          >
                            {/* Answer Header */}
                            <div className="flex items-center justify-between px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${isWinner ? 'bg-yellow-900/50' : 'bg-blue-900/50'}`}>
                                  {isWinner ? (
                                    <Trophy className="w-4 h-4 text-yellow-400" />
                                  ) : (
                                    <User className="w-4 h-4 text-blue-400" />
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-200">{answer.agentId}</span>
                                    <span className="text-gray-500 text-sm">
                                      {answer.answerNumber === 0 ? 'Final Answer' : `Answer #${answer.answerNumber}`}
                                    </span>
                                    {answer.answerNumber === 0 && (
                                      <span className="px-2 py-0.5 bg-green-900/50 text-green-300 rounded-full text-xs">
                                        Final
                                      </span>
                                    )}
                                    {isWinner && answer.answerNumber !== 0 && (
                                      <span className="px-2 py-0.5 bg-yellow-900/50 text-yellow-300 rounded-full text-xs">
                                        Winner
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                    <Clock className="w-3 h-3" />
                                    <span>{formatTimestamp(answer.timestamp)}</span>
                                  </div>
                                </div>
                              </div>
                              <motion.div
                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                className="text-gray-400"
                              >
                                <ChevronDown className="w-5 h-5" />
                              </motion.div>
                            </div>

                            {/* Answer Content (Expandable) */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="border-t border-gray-600"
                                >
                                  <div className="p-4 bg-gray-800/50">
                                    <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono leading-relaxed max-h-96 overflow-y-auto custom-scrollbar">
                                      {resolveAnswerContent(answer, agents, finalAnswer)}
                                    </pre>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : activeTab === 'votes' ? (
              <>
                {/* Votes Tab Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                  {/* Vote Distribution Summary */}
                  {sortedDistribution.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                        <Trophy className="w-4 h-4" />
                        Vote Distribution
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {sortedDistribution.map(({ agentId, agentIndex, modelName, votes: voteCount, isWinner }) => (
                          <div
                            key={agentId}
                            className={`
                              flex items-center justify-between px-4 py-3 rounded-lg
                              ${isWinner
                                ? 'bg-yellow-500/20 border border-yellow-500/50'
                                : 'bg-gray-700/50 border border-gray-600'
                              }
                            `}
                          >
                            <div className="flex items-center gap-2">
                              <User className={`w-4 h-4 ${isWinner ? 'text-yellow-400' : 'text-gray-400'}`} />
                              <div>
                                <span className={`font-medium ${isWinner ? 'text-yellow-300' : 'text-gray-200'}`}>
                                  Agent {agentIndex}
                                </span>
                                {modelName && (
                                  <span className="text-xs text-gray-500 block">{modelName}</span>
                                )}
                              </div>
                              {isWinner && <span className="text-sm">👑</span>}
                            </div>
                            <span className={`text-lg font-bold ${isWinner ? 'text-yellow-400' : 'text-gray-300'}`}>
                              {voteCount}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Individual Votes */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                      <Vote className="w-4 h-4" />
                      Individual Votes
                    </h3>

                    {votes.length === 0 ? (
                      <EmptyState
                        icon={Vote}
                        title={EMPTY_STATES.noVotes.title}
                        description={EMPTY_STATES.noVotes.description}
                        hint={EMPTY_STATES.noVotes.hint}
                        size="sm"
                      />
                    ) : (
                      <div className="space-y-3">
                        {votes.map((vote) => (
                          <motion.div
                            key={`${vote.voterId}-${vote.voteRound}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`rounded-lg border overflow-hidden ${
                              vote.isValid
                                ? 'bg-gray-700/50 border-gray-600'
                                : 'bg-gray-800/30 border-gray-700/50 opacity-60'
                            }`}
                          >
                            {/* Vote header */}
                            <div className={`flex items-center gap-3 px-4 py-3 ${
                              vote.isValid ? 'bg-gray-700/50' : 'bg-gray-800/30'
                            }`}>
                              <div className="flex items-center gap-2 text-gray-300">
                                <User className={`w-4 h-4 ${vote.isValid ? 'text-blue-400' : 'text-gray-500'}`} />
                                <span className={`font-medium ${!vote.isValid && 'text-gray-500'}`}>Agent {vote.voterIndex}</span>
                                {vote.voterModel && (
                                  <span className="text-xs text-gray-500">({vote.voterModel})</span>
                                )}
                              </div>
                              <ArrowRight className={`w-4 h-4 ${vote.isValid ? 'text-amber-500' : 'text-gray-600'}`} />
                              <div className="flex items-center gap-2">
                                <span className={`font-medium px-2 py-0.5 rounded ${
                                  !vote.isValid
                                    ? 'bg-gray-600/30 text-gray-500 line-through'
                                    : vote.targetId === selectedAgent
                                      ? 'bg-yellow-500/30 text-yellow-300'
                                      : 'bg-green-500/20 text-green-300'
                                }`}>
                                  {vote.votedAnswerLabel}
                                </span>
                                {vote.isValid && vote.targetId === selectedAgent && <span className="text-sm">👑</span>}
                                {!vote.isValid && (
                                  <span className="text-xs text-red-400/70 bg-red-900/30 px-1.5 py-0.5 rounded">
                                    superseded
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Vote details */}
                            <div className="px-4 py-3 border-t border-gray-600/50 space-y-2">
                              {/* Voted for */}
                              <div className="text-sm">
                                <span className="text-gray-500">Voted for: </span>
                                <span className={vote.isValid ? 'text-gray-300' : 'text-gray-500'}>
                                  Agent {vote.targetIndex}
                                  {vote.targetModel && ` (${vote.targetModel})`}
                                </span>
                              </div>

                              {/* Available choices */}
                              <div className="text-sm">
                                <span className="text-gray-500">From choices: </span>
                                <span className="text-gray-400">
                                  {vote.availableAnswers.join(', ')}
                                </span>
                              </div>

                              {/* Reason */}
                              <div className="mt-2 pt-2 border-t border-gray-600/50">
                                <p className={`text-sm italic ${vote.isValid ? 'text-gray-400' : 'text-gray-500'}`}>{vote.reason}</p>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : activeTab === 'workspace' ? (
              <>
                {/* Per-Agent Workspace Selector Bar */}
                <div className="px-6 py-3 border-b border-gray-700 bg-gray-800/50 flex items-center gap-4 flex-wrap">
                  {/* Agent Buttons */}
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-gray-400">Agent:</span>
                    <div className="flex gap-1">
                      {agentOrder.map((agentId, index) => {
                        const agentData = workspacesByAgent[agentId];
                        const hasWorkspace = agentData?.current || agentData?.historical.length > 0;
                        if (!hasWorkspace) return null;

                        const agentColor = getAgentColor(agentId, agentOrder);
                        const isSelected = selectedAgentWorkspace === agentId;

                        return (
                          <button
                            key={agentId}
                            onClick={() => {
                              setSelectedAgentWorkspace(agentId);
                              setSelectedAnswerLabel('current');
                              setSelectedFilePath(''); // Clear selection for auto-preview
                              fetchWorkspaces();
                            }}
                            className={`px-3 py-1 text-sm rounded transition-colors ${
                              isSelected
                                ? `${agentColor.bg} text-white`
                                : `${agentColor.bgLight} ${agentColor.text} hover:opacity-80`
                            }`}
                          >
                            Agent {index + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Answer Version Dropdown - uses answers from agentStore for immediate updates */}
                  {selectedAgentWorkspace && (
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-amber-400" />
                      <span className="text-sm text-gray-400">Version:</span>
                      <div className="relative">
                        <select
                          value={selectedAnswerLabel}
                          onChange={(e) => {
                            const label = e.target.value;
                            // FIX: Clear file content caches when switching versions
                            // This prevents stale 404s from persisting across version switches
                            clearFileCache();
                            setSelectedAnswerLabel(label);

                            // Always clear file selection when switching versions
                            setSelectedFilePath('');

                            // When switching to "current", trigger a refresh to get latest files
                            if (label === 'current' && refreshSessionFn) {
                              refreshSessionFn();
                            }
                          }}
                          className="appearance-none bg-gray-700 border border-gray-600 rounded-lg px-3 py-1 pr-8 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="current">Live</option>
                          {/* Show versions from answers (instant via WebSocket), not answerWorkspaces (requires HTTP) */}
                          {answers
                            .filter(a => a.agentId === selectedAgentWorkspace && a.answerNumber > 0)
                            .sort((a, b) => b.answerNumber - a.answerNumber)
                            .map((answer) => {
                              const agentIdx = agentOrder.indexOf(answer.agentId) + 1;
                              const label = `agent${agentIdx}.${answer.answerNumber}`;
                              return (
                                <option key={answer.id} value={label}>
                                  {getAnswerWorkspaceLabel(answer.answerNumber)}
                                </option>
                              );
                            })}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  )}

                  {/* Compare Button */}
                  {totalWorkspaces >= 2 && (
                    <button
                      onClick={() => setIsComparisonOpen(true)}
                      className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors text-white text-sm"
                      title="Compare workspaces side-by-side"
                    >
                      <Columns className="w-4 h-4" />
                      <span>Compare</span>
                    </button>
                  )}

                  {/* Open Folder Button */}
                  {activeWorkspace && (
                    <button
                      onClick={() => openWorkspaceInFinder(activeWorkspace.path)}
                      className={`flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-white text-sm ${totalWorkspaces < 2 ? 'ml-auto' : ''}`}
                      title="Open workspace in file browser"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Open Folder</span>
                    </button>
                  )}

                  {/* WebSocket Connection Status (T016) */}
                  <div
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
                      wsStatus === 'connected'
                        ? 'bg-green-900/30 text-green-400'
                        : wsStatus === 'reconnecting'
                        ? 'bg-amber-900/30 text-amber-400'
                        : wsStatus === 'connecting'
                        ? 'bg-blue-900/30 text-blue-400'
                        : 'bg-gray-700/50 text-gray-500'
                    }`}
                    title={
                      wsStatus === 'connected'
                        ? 'Real-time updates active'
                        : wsStatus === 'reconnecting'
                        ? `Reconnecting... (attempt ${wsReconnectAttempts})`
                        : wsStatus === 'connecting'
                        ? 'Connecting...'
                        : wsError || 'Disconnected'
                    }
                  >
                    {wsStatus === 'connected' ? (
                      <Wifi className="w-3 h-3" />
                    ) : (
                      <WifiOff className="w-3 h-3" />
                    )}
                    <span>
                      {wsStatus === 'connected'
                        ? 'Live'
                        : wsStatus === 'reconnecting'
                        ? 'Reconnecting...'
                        : wsStatus === 'connecting'
                        ? 'Connecting...'
                        : 'Offline'}
                    </span>
                  </div>

                  {/* Refresh Button */}
                  <button
                    onClick={() => {
                      fetchWorkspaces();
                      // For historical workspaces, refetch files; current workspaces auto-update via WebSocket
                      if (activeWorkspace && selectedAnswerLabel !== 'current') {
                        fetchHistoricalFiles(selectedAnswerLabel, activeWorkspace.path);
                      }
                    }}
                    disabled={isLoadingWorkspaces || isLoadingFiles}
                    className={`${!activeWorkspace ? 'ml-auto' : ''} p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-gray-200`}
                    title="Refresh workspaces"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingWorkspaces || isLoadingFiles ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {/* Error Display with Retry Button (T019) */}
                {workspaceError && (
                  <div className="px-6 py-2 bg-red-900/30 border-b border-red-700 text-red-300 text-sm flex items-center justify-between">
                    <span>{workspaceError}</span>
                    <button
                      onClick={() => {
                        fetchWorkspaces();
                        if (activeWorkspace && selectedAnswerLabel !== 'current') {
                          fetchHistoricalFiles(selectedAnswerLabel, activeWorkspace.path);
                        }
                      }}
                      className="ml-4 px-3 py-1 bg-red-800/50 hover:bg-red-700/50 rounded text-red-200 text-xs transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {missingVersion && (
                  <div className="px-6 py-2 bg-amber-900/30 border-b border-amber-700 text-amber-200 text-sm">
                    {missingVersion}
                  </div>
                )}

                {/* Split View: File Tree + Preview - wrapped in relative for overlay */}
                <div className="relative flex-1 flex overflow-hidden">
                  {/* New Answer Notification - Prominent Modal Overlay */}
                  <AnimatePresence>
                    {newAnswerNotification && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] z-20 flex items-center justify-center"
                      >
                        <motion.div
                          initial={{ scale: 0.9, opacity: 0, y: 20 }}
                          animate={{ scale: 1, opacity: 1, y: 0 }}
                          exit={{ scale: 0.9, opacity: 0, y: 20 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                          className="bg-gray-800 border-2 border-blue-500 rounded-xl p-6 shadow-2xl shadow-blue-500/20 max-w-md mx-4"
                        >
                          <div className="flex flex-col items-center gap-4 text-center">
                            {/* Icon with pulse animation */}
                            <motion.div
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                              className="p-3 bg-blue-600/30 rounded-full"
                            >
                              <Bell className="w-8 h-8 text-blue-400" />
                            </motion.div>

                            {/* Title and description */}
                            <div>
                              <h3 className="text-xl font-semibold text-blue-300">
                                New Answer Available
                              </h3>
                              <p className="text-gray-400 mt-2">
                                <span className="text-blue-200 font-medium">
                                  {newAnswerNotification.displayLabel}
                                </span>{' '}
                                has been submitted for{' '}
                                <span className="text-blue-200 font-medium">
                                  {newAnswerNotification.agentId}
                                </span>
                              </p>
                              <p className="text-sm text-gray-500 mt-1">
                                You are currently viewing a historical workspace version.
                              </p>
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-3 mt-2 w-full">
                              <button
                                onClick={handleMoveToCurrentWorkspace}
                                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                              >
                                <RefreshCw className="w-4 h-4" />
                                Move to Live
                              </button>
                              <button
                                onClick={handleStayInHistorical}
                                className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                              >
                                <History className="w-4 h-4" />
                                Stay Here
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Resizable Split: File Tree + Preview */}
                  <ResizableSplitPane
                    storageKey="workspace-browser-split"
                    defaultLeftWidth={35}
                    minLeftWidth={20}
                    maxLeftWidth={50}
                    className="flex-1"
                    left={
                      <div className="h-full overflow-y-auto custom-scrollbar p-3">
                        {/* Only show full loading state on first load (no workspaces yet) */}
                        {isLoadingWorkspaces && totalWorkspaces === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <RefreshCw className="w-6 h-6 mb-3 animate-spin" />
                            <p className="text-sm">Loading workspaces...</p>
                          </div>
                        ) : totalWorkspaces === 0 ? (
                          <EmptyState
                            icon={Folder}
                            title={EMPTY_STATES.noWorkspaces.title}
                            description={EMPTY_STATES.noWorkspaces.description}
                            hint={EMPTY_STATES.noWorkspaces.hint}
                            size="sm"
                          />
                        ) : !activeWorkspace ? (
                          <EmptyState
                            icon={Folder}
                            title="Select an agent"
                            description={EMPTY_STATES.noFiles.description}
                            hint={EMPTY_STATES.noFiles.hint}
                            size="sm"
                          />
                        ) : isLoadingFiles && filteredWorkspaceFiles.length === 0 ? (
                          <EmptyState
                            icon={RefreshCw}
                            title={EMPTY_STATES.loading.title}
                            description="Fetching workspace files..."
                            size="sm"
                          />
                        ) : filteredWorkspaceFiles.length === 0 ? (
                          <EmptyState
                            icon={Folder}
                            title={EMPTY_STATES.noFiles.title}
                            description={EMPTY_STATES.noFiles.description}
                            size="sm"
                          />
                        ) : (
                          <div>
                            <div className="mb-2 text-xs text-gray-500 flex items-center gap-2">
                              <span>{filteredWorkspaceFiles.length} files</span>
                              {selectedAnswerLabel !== 'current' && (
                                <span className="text-amber-400">(historical)</span>
                              )}
                              {isLoadingFiles && (
                                <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                              )}
                            </div>
                            {fileTree.map((node) => (
                              <FileNode key={node.path} node={node} depth={0} onFileClick={handleFileClick} />
                            ))}
                          </div>
                        )}
                      </div>
                    }
                    right={
                      <div className="h-full overflow-auto">
                        {selectedFilePath && activeWorkspace ? (
                          <InlineArtifactPreview
                            filePath={selectedFilePath}
                            workspacePath={activeWorkspace.path}
                            onClose={handleInlinePreviewClose}
                            onFullscreen={() => setIsPreviewFullscreen(true)}
                            sessionId={sessionId}
                            agentId={selectedAgentWorkspace || undefined}
                            onFileNotFound={() => setSelectedFilePath('')}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-gray-500 bg-gray-800/30 rounded-lg border border-gray-700 m-3">
                            <Eye className="w-12 h-12 mb-4 opacity-30" />
                            <p className="text-sm">Select a file to preview</p>
                            <p className="text-xs text-gray-600 mt-1">Click any file in the tree</p>
                          </div>
                        )}
                      </div>
                    }
                  />
                </div>

                {/* Workspace Summary */}
                {activeWorkspace && filteredWorkspaceFiles.length > 0 && (
                  <div className="border-t border-gray-700 px-6 py-3 text-sm text-gray-400 flex items-center justify-between">
                    <span>
                      {filteredWorkspaceFiles.length} files in {activeWorkspace.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {activeWorkspace.path}
                    </span>
                  </div>
                )}
              </>
            ) : activeTab === 'timeline' ? (
              <div className="flex-1 overflow-hidden">
                <TimelineView onNodeClick={handleTimelineNodeClick} />
              </div>
            ) : null}
          </motion.div>
        </>
      )}

      {/* Artifact Preview Modal */}
      <ArtifactPreviewModal
        isOpen={fileViewerOpen}
        onClose={handlePreviewClose}
        filePath={selectedFilePath}
        workspacePath={activeWorkspace?.path || ''}
      />

      {/* Fullscreen Preview Modal */}
      {isPreviewFullscreen && selectedFilePath && activeWorkspace && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setIsPreviewFullscreen(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full h-full max-w-[95vw] max-h-[95vh] bg-gray-900 rounded-xl shadow-2xl overflow-hidden flex flex-col border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fullscreen header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <File className="w-4 h-4" />
                <span className="font-medium">{selectedFilePath}</span>
              </div>
              <button
                onClick={() => setIsPreviewFullscreen(false)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
                title="Close fullscreen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Fullscreen preview content */}
            <div className="flex-1 overflow-auto p-4">
              <InlineArtifactPreview
                filePath={selectedFilePath}
                workspacePath={activeWorkspace.path}
                onClose={() => setIsPreviewFullscreen(false)}
                sessionId={sessionId}
                agentId={selectedAgentWorkspace || undefined}
                onFileNotFound={() => {
                  setSelectedFilePath('');
                  setIsPreviewFullscreen(false);
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Side-by-Side Comparison View */}
      <ComparisonView
        isOpen={isComparisonOpen}
        onClose={() => setIsComparisonOpen(false)}
        agentWorkspaces={workspacesByAgent}
        answerWorkspaces={answerWorkspaces}
        agentOrder={agentOrder}
        sessionId={sessionId}
        initialFile={selectedFilePath}
      />
    </AnimatePresence>
  );
}

export default AnswerBrowserModal;
