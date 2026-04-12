/**
 * FinalAnswerView Component
 *
 * Full-screen display of the completed final answer.
 * Features tabbed interface for Answer and Workspace views.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, FileText, Folder, Trophy, ChevronDown, ChevronRight, File, RefreshCw, History, Copy, Check, Loader2, Send, Plus, ExternalLink, Share2, X, Eye, Columns } from 'lucide-react';
import { useAgentStore, selectSelectedAgent, selectAgents, selectResolvedFinalAnswer, selectAgentOrder } from '../stores/agentStore';
import type { AnswerWorkspace } from '../types';
import { InlineArtifactPreview } from './InlineArtifactPreview';
import { ConversationHistory } from './ConversationHistory';
import { ComparisonView } from './ComparisonView';
import { ResizableSplitPane } from './ResizableSplitPane';
import { canPreviewFile } from '../utils/artifactTypes';
import { clearFileCache } from '../hooks/useFileContent';
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
  agentId?: string;
}

interface WorkspacesResponse {
  current: WorkspaceInfo[];
  historical: WorkspaceInfo[];
}

interface AnswerWorkspacesResponse {
  workspaces: AnswerWorkspace[];
  current: WorkspaceInfo[];
}

interface FileInfo {
  path: string;
  size: number;
  modified: number;
  operation?: 'create' | 'modify' | 'delete';
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
    const index = parseInt(match[1], 10) - 1;
    return agentOrder[index];
  }
  return undefined;
}

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// File tree types and helpers
interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
  size?: number;
  modified?: number;
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

function FileNode({ node, depth, onFileClick }: FileNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isPreviewable = !node.isDirectory && canPreviewFile(node.name);

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
          flex items-center gap-1 py-1.5 px-2 hover:bg-gray-100 dark:hover:bg-gray-700/30 rounded cursor-pointer
          text-sm text-gray-700 dark:text-gray-300
          ${!node.isDirectory && onFileClick ? 'hover:bg-blue-100 dark:hover:bg-blue-900/30' : ''}
          ${isPreviewable ? 'text-violet-600 dark:text-violet-400' : ''}
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
        ) : (
          <File className={`w-4 h-4 ${isPreviewable ? 'text-violet-400' : 'text-gray-400'}`} />
        )}

        <span className="flex-1">{node.name}</span>

        {isPreviewable && (
          <span title="Rich preview available">
            <Eye className="w-3.5 h-3.5 text-violet-400" />
          </span>
        )}

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

type TabType = 'answer' | 'workspace';

interface FinalAnswerViewProps {
  onBackToAgents: () => void;
  onFollowUp?: (question: string) => void;
  onNewSession?: () => void;
  isConnected?: boolean;
}

export function FinalAnswerView({ onBackToAgents, onFollowUp, onNewSession, isConnected = true }: FinalAnswerViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('answer');
  const [copied, setCopied] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState('');

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareResult, setShareResult] = useState<{ url: string; message: string } | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  const finalAnswer = useAgentStore(selectResolvedFinalAnswer);
  const selectedAgent = useAgentStore(selectSelectedAgent);
  const agents = useAgentStore(selectAgents);
  const agentOrder = useAgentStore(selectAgentOrder);
  const sessionId = useAgentStore((s) => s.sessionId);

  const winnerAgent = selectedAgent ? agents[selectedAgent] : null;
  const displayName = winnerAgent?.modelName
    ? `${selectedAgent} (${winnerAgent.modelName})`
    : selectedAgent;

  // Workspace state
  const [workspaces, setWorkspaces] = useState<WorkspacesResponse>({ current: [], historical: [] });
  const [workspaceFiles, setWorkspaceFiles] = useState<FileInfo[]>([]);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [answerWorkspaces, setAnswerWorkspaces] = useState<AnswerWorkspace[]>([]);
  const [selectedAnswerLabel, setSelectedAnswerLabel] = useState<string>('current');
  // Track which agent's workspace we're viewing (defaults to winner)
  const [selectedAgentWorkspace, setSelectedAgentWorkspace] = useState<string | null>(null);

  // File viewer state (inline preview, not modal)
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);

  // Comparison view state
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);

  // Track auto-preview per workspace
  const hasAutoPreviewedRef = useRef<string | null>(null);
  // Track previous workspace path for change detection
  const prevWorkspacePathRef = useRef<string | null>(null);

  // Reset workspace-related state when session changes (new run)
  useEffect(() => {
    setWorkspaces({ current: [], historical: [] });
    setWorkspaceFiles([]);
    setSelectedFilePath('');
    setSelectedAnswerLabel('current');
    setSelectedAgentWorkspace(null);
    setWorkspaceError(null);
    setIsLoadingFiles(false);
    setIsLoadingWorkspaces(false);
    hasAutoPreviewedRef.current = null;
    prevWorkspacePathRef.current = null;
    clearFileCache();
  }, [sessionId]);

  // Initialize selectedAgentWorkspace to winner when available
  useEffect(() => {
    if (selectedAgent && !selectedAgentWorkspace) {
      setSelectedAgentWorkspace(selectedAgent);
    }
  }, [selectedAgent, selectedAgentWorkspace]);

  // Handle file click from workspace browser - sets file for inline preview
  const handleFileClick = useCallback((filePath: string) => {
    setSelectedFilePath(filePath);
  }, []);

  // Handle closing inline preview
  const handleInlinePreviewClose = useCallback(() => {
    setSelectedFilePath('');
  }, []);

  // Fetch workspaces
  const fetchWorkspaces = useCallback(async () => {
    setIsLoadingWorkspaces(true);
    setWorkspaceError(null);
    try {
      const url = sessionId
        ? `/api/workspaces?session_id=${encodeURIComponent(sessionId)}`
        : '/api/workspaces';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch workspaces');
      const data: WorkspacesResponse = await response.json();
      setWorkspaces(data);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      setIsLoadingWorkspaces(false);
    }
  }, [sessionId]);

  // Fetch workspace files
  const fetchWorkspaceFiles = useCallback(async (workspace: WorkspaceInfo) => {
    setIsLoadingFiles(true);
    setWorkspaceError(null);
    try {
      const response = await fetch(`/api/workspace/browse?path=${encodeURIComponent(workspace.path)}`);
      if (!response.ok) throw new Error('Failed to fetch workspace files');
      const data = await response.json();
      setWorkspaceFiles(data.files || []);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Failed to load files');
      setWorkspaceFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  // Fetch answer workspaces
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

  // Map workspaces to selected agent (defaults to winner, but can switch)
  const activeWorkspace = useMemo(() => {
    const targetAgent = selectedAgentWorkspace || selectedAgent;
    if (!targetAgent) return null;

    // If viewing historical version, get path from answerWorkspaces
    if (selectedAnswerLabel !== 'current') {
      const answerWs = answerWorkspaces.find(
        (w) => w.agentId === targetAgent && w.answerLabel === selectedAnswerLabel
      );
      if (answerWs) {
        return {
          name: answerWs.answerLabel,
          path: answerWs.workspacePath,
          type: 'historical' as const,
        };
      }
      return null;
    }

    // For FinalAnswerView, prioritize final workspace from log directory
    // Look for workspace with /final/ in path from answerWorkspaces
    const finalWs = answerWorkspaces.find(
      (w) => w.agentId === targetAgent && w.workspacePath.includes('/final/')
    );
    if (finalWs) {
      return {
        name: 'Final',
        path: finalWs.workspacePath,
        type: 'historical' as const,
      };
    }

    // Fallback: Get current workspace for the agent
    const ws = workspaces.current.find((w) => {
      const agentId = getAgentIdFromWorkspace(w.name, agentOrder);
      return agentId === targetAgent;
    });
    return ws || null;
  }, [workspaces, selectedAgent, selectedAgentWorkspace, selectedAnswerLabel, answerWorkspaces, agentOrder]);

  // Check if current agent is the winner AND has a workspace
  // Only the winner agent should show "Final" option
  const hasFinalWorkspace = useMemo(() => {
    const targetAgent = selectedAgentWorkspace || selectedAgent;
    // Only show "Final" for the winner agent
    if (!targetAgent || targetAgent !== selectedAgent) return false;
    return workspaces.current.some((w) => {
      const agentId = getAgentIdFromWorkspace(w.name, agentOrder);
      return agentId === targetAgent;
    });
  }, [workspaces, selectedAgent, selectedAgentWorkspace, agentOrder]);

  // Get historical workspaces for current agent
  const agentHistoricalWorkspaces = useMemo(() => {
    const targetAgent = selectedAgentWorkspace || selectedAgent;
    return answerWorkspaces.filter(w => w.agentId === targetAgent);
  }, [answerWorkspaces, selectedAgentWorkspace, selectedAgent]);

  // Map workspaces by agent for ComparisonView
  const workspacesByAgent = useMemo(() => {
    const map: Record<string, { current?: WorkspaceInfo; historical: WorkspaceInfo[] }> = {};

    // Initialize for all agents
    agentOrder.forEach((agentId) => {
      map[agentId] = { historical: [] };
    });

    // Map current workspaces
    workspaces.current.forEach((ws) => {
      const agentId = ws.agentId || getAgentIdFromWorkspace(ws.name, agentOrder);
      if (agentId && map[agentId]) {
        map[agentId].current = ws;
      }
    });

    // Map historical workspaces from answer workspaces
    answerWorkspaces.forEach((aw) => {
      if (map[aw.agentId]) {
        map[aw.agentId].historical.push({
          name: aw.answerLabel,
          path: aw.workspacePath,
          type: 'historical',
          agentId: aw.agentId,
        });
      }
    });

    return map;
  }, [workspaces, answerWorkspaces, agentOrder]);

  // Count total workspaces for compare button visibility
  const totalWorkspaces = useMemo(() => {
    let count = 0;
    Object.values(workspacesByAgent).forEach(({ current, historical }) => {
      if (current) count++;
      count += historical.length;
    });
    return count;
  }, [workspacesByAgent]);

  // Fetch workspaces when workspace tab is active
  useEffect(() => {
    if (activeTab === 'workspace') {
      fetchWorkspaces();
      fetchAnswerWorkspaces();
    }
  }, [activeTab, fetchWorkspaces, fetchAnswerWorkspaces, sessionId]);

  // Fetch files when workspace is available
  // Also clear selected file when workspace changes to avoid showing stale content
  useEffect(() => {
    const currentPath = activeWorkspace?.path || null;
    const pathChanged = prevWorkspacePathRef.current !== currentPath;

    if (activeWorkspace && activeTab === 'workspace' && pathChanged) {
      prevWorkspacePathRef.current = currentPath;
      // Clear the selected file path when workspace actually changes
      setSelectedFilePath('');
      // Reset auto-preview tracking for this new workspace
      hasAutoPreviewedRef.current = null;
      // Clear workspace files first to show loading state
      setWorkspaceFiles([]);
      fetchWorkspaceFiles(activeWorkspace);
    } else if (!activeWorkspace && workspaceFiles.length > 0) {
      setWorkspaceFiles([]);
      setSelectedFilePath('');
    }
  }, [activeWorkspace, activeTab, fetchWorkspaceFiles, workspaceFiles.length]);

  // Clear selected file when workspace files become empty (prevents stale preview)
  useEffect(() => {
    if (workspaceFiles.length === 0 && selectedFilePath && !isLoadingFiles) {
      setSelectedFilePath('');
    }
  }, [workspaceFiles.length, selectedFilePath, isLoadingFiles]);

  // Build file tree
  const fileTree = useMemo(() => buildFileTree(workspaceFiles), [workspaceFiles]);

  // Auto-preview: Select first previewable file when workspace files are loaded
  useEffect(() => {
    const workspaceKey = activeWorkspace?.path || '';
    if (
      workspaceFiles.length > 0 &&
      !selectedFilePath &&
      activeTab === 'workspace' &&
      hasAutoPreviewedRef.current !== workspaceKey
    ) {
      // Find main previewable file with priority: PDF > PPTX > DOCX > HTML > images > other
      const findMainPreviewable = (): string | null => {
        const previewableFiles = workspaceFiles.filter(f => canPreviewFile(f.path));
        if (previewableFiles.length === 0) return null;

        // Priority 1: PDF
        const pdf = previewableFiles.find(f => f.path.toLowerCase().endsWith('.pdf'));
        if (pdf) return pdf.path;

        // Priority 2: PPTX
        const pptx = previewableFiles.find(f => f.path.toLowerCase().endsWith('.pptx'));
        if (pptx) return pptx.path;

        // Priority 3: DOCX
        const docx = previewableFiles.find(f => f.path.toLowerCase().endsWith('.docx'));
        if (docx) return docx.path;

        // Priority 4: index.html
        const indexHtml = previewableFiles.find(f => f.path.toLowerCase().endsWith('index.html'));
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

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (finalAnswer && finalAnswer !== '__PENDING__') {
      await navigator.clipboard.writeText(finalAnswer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [finalAnswer]);

  // Handle follow-up question submission
  const handleFollowUpSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (followUpQuestion.trim() && onFollowUp) {
      onFollowUp(followUpQuestion.trim());
      setFollowUpQuestion('');
    }
  }, [followUpQuestion, onFollowUp]);

  // Share - create gist and show result
  const handleShare = useCallback(async () => {
    const sessionId = useAgentStore.getState().sessionId;
    if (!sessionId) return;
    setIsSharing(true);
    setShareError(null);
    setShareResult(null);
    setShowShareModal(true);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/share`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        setShareError(data.error || 'Failed to share session');
        return;
      }
      setShareResult({ url: data.viewer_url, message: data.message });
    } catch (err) {
      console.error('Share failed:', err);
      setShareError('Failed to share session. Check console for details.');
    } finally {
      setIsSharing(false);
    }
  }, []);

  // Copy share link to clipboard
  const handleCopyShareLink = useCallback(async () => {
    if (!shareResult?.url) return;
    await navigator.clipboard.writeText(shareResult.url);
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 2000);
  }, [shareResult]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="fixed inset-0 bg-white dark:bg-gray-900 z-40 flex flex-col"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <button
          onClick={onBackToAgents}
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700
                     hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors
                     text-gray-700 dark:text-gray-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Agents
        </button>

        <div className="flex items-center gap-3">
          <Trophy className="w-6 h-6 text-yellow-500" />
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Final Answer
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              from <span className="text-yellow-600 dark:text-yellow-400 font-medium">{displayName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500
                       rounded-lg transition-colors text-white"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500
                       rounded-lg transition-colors text-white"
            title="Share session via GitHub Gist"
          >
            <Share2 className="w-4 h-4" />
            Share
          </button>
          {onNewSession && (
            <button
              onClick={onNewSession}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500
                         rounded-lg transition-colors text-white"
            >
              <Plus className="w-4 h-4" />
              New Session
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 px-6 bg-gray-50 dark:bg-gray-800/50">
        <button
          onClick={() => setActiveTab('answer')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'answer'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          Answer
        </button>
        <button
          onClick={() => setActiveTab('workspace')}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'workspace'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <Folder className="w-4 h-4" />
          Workspace
        </button>
      </div>

      {/* Tab Content */}
      <main className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'answer' ? (
            <motion.div
              key="answer"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="h-full overflow-y-auto custom-scrollbar p-6"
            >
              <div className="max-w-4xl mx-auto space-y-6">
                {/* Conversation History - shown at top for context */}
                <ConversationHistory />

                {/* Final Answer Content */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  {!finalAnswer || finalAnswer === '__PENDING__' ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                      <Loader2 className="w-8 h-8 mb-4 animate-spin text-blue-500" />
                      <p>Loading final answer...</p>
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 font-mono text-sm leading-relaxed">
                      {finalAnswer}
                    </pre>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="workspace"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col"
            >
              {/* Workspace toolbar */}
              <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-4 flex-wrap">
                {/* Agent selector */}
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">Agent:</span>
                  <div className="flex gap-1">
                    {agentOrder.map((agentId) => {
                      const isWinner = agentId === selectedAgent;
                      const isSelected = agentId === (selectedAgentWorkspace || selectedAgent);
                      return (
                        <button
                          key={agentId}
                          onClick={() => {
                            setSelectedAgentWorkspace(agentId);
                            // For winner, default to 'current' (Final)
                            // For non-winners, default to most recent (highest answerNumber) workspace
                            if (agentId === selectedAgent) {
                              setSelectedAnswerLabel('current');
                            } else {
                              const agentWs = answerWorkspaces
                                .filter(w => w.agentId === agentId)
                                .sort((a, b) => (b.answerNumber || 0) - (a.answerNumber || 0));
                              if (agentWs.length > 0) {
                                // Select the most recent answer (highest answerNumber)
                                setSelectedAnswerLabel(agentWs[0].answerLabel);
                              } else {
                                setSelectedAnswerLabel('current'); // Will show empty state
                              }
                            }
                            setSelectedFilePath('');
                          }}
                        className={`px-3 py-1 text-sm rounded transition-colors flex items-center gap-1 ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                      >
                          {getAgentWorkspaceLabel(agentId, agentOrder)}
                          {isWinner && <Trophy className="w-3 h-3 text-yellow-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Version selector - only show if there are versions to select */}
                {(hasFinalWorkspace || agentHistoricalWorkspaces.length > 0) && (
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-amber-500" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">Version:</span>
                    <div className="relative">
                      <select
                        value={selectedAnswerLabel}
                        onChange={(e) => {
                          const label = e.target.value;
                          setSelectedAnswerLabel(label);
                          // Workspace will be automatically updated via activeWorkspace memo
                          setSelectedFilePath('');
                        }}
                        className="appearance-none bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600
                                   rounded-lg px-3 py-1.5 pr-8 text-sm text-gray-700 dark:text-gray-200
                                   focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {hasFinalWorkspace && <option value="current">Final</option>}
                        {agentHistoricalWorkspaces
                          .slice()
                          .sort((left, right) => (right.answerNumber || 0) - (left.answerNumber || 0))
                          .map((ws) => (
                          <option key={ws.answerId} value={ws.answerLabel}>
                            {getAnswerWorkspaceLabel(ws.answerNumber)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Compare button - show when there are 2+ workspaces */}
                {totalWorkspaces >= 2 && (
                  <button
                    onClick={() => setIsComparisonOpen(true)}
                    className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500
                               rounded-lg transition-colors text-white text-sm"
                    title="Compare workspaces side-by-side"
                  >
                    <Columns className="w-4 h-4" />
                    <span>Compare</span>
                  </button>
                )}

                {/* Open Folder button */}
                {activeWorkspace && (
                  <button
                    onClick={() => openWorkspaceInFinder(activeWorkspace.path)}
                    className={`${totalWorkspaces < 2 ? 'ml-auto' : ''} flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500
                               rounded-lg transition-colors text-white text-sm`}
                    title="Open workspace in file browser"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open Folder</span>
                  </button>
                )}

                {/* Refresh button */}
                <button
                  onClick={() => { fetchWorkspaces(); fetchAnswerWorkspaces(); }}
                  disabled={isLoadingWorkspaces}
                  className={`${!activeWorkspace ? 'ml-auto' : ''} p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors
                             text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200`}
                  title="Refresh workspaces"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingWorkspaces ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Active workspace path display */}
              {activeWorkspace && (
                <div className="px-6 py-2 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <span className="font-semibold text-gray-600 dark:text-gray-300">Path:</span>
                  <span className="truncate" title={activeWorkspace.path}>
                    {activeWorkspace.path}
                  </span>
                  <span className={selectedAnswerLabel === 'current' ? 'text-green-600 dark:text-green-400 font-medium' : 'text-amber-600 dark:text-amber-400 font-medium'}>
                    ({selectedAnswerLabel === 'current' ? 'final' : 'historical snapshot'})
                  </span>
                </div>
              )}

              {/* Error display */}
              {workspaceError && (
                <div className="px-6 py-2 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-700 text-red-600 dark:text-red-300 text-sm">
                  {workspaceError}
                </div>
              )}

              {/* Split View: File Tree + Preview with draggable divider */}
              <div className="flex-1 overflow-hidden">
                {isPreviewFullscreen ? (
                  /* When fullscreen, show only the preview */
                  <div className="h-full overflow-hidden p-4 relative">
                    {selectedFilePath && activeWorkspace ? (
                      <InlineArtifactPreview
                        filePath={selectedFilePath}
                        workspacePath={activeWorkspace.path}
                        onClose={handleInlinePreviewClose}
                        onFullscreen={() => setIsPreviewFullscreen(true)}
                        onFileNotFound={handleInlinePreviewClose}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-gray-500 bg-gray-100 dark:bg-gray-800/30 rounded-lg border border-gray-200 dark:border-gray-700">
                        <Eye className="w-12 h-12 mb-4 opacity-30" />
                        <p className="text-sm">Select a file to preview</p>
                        <p className="text-xs text-gray-400 mt-1">Click any file in the tree</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <ResizableSplitPane
                    storageKey="final-workspace-split"
                    defaultLeftWidth={25}
                    minLeftWidth={15}
                    maxLeftWidth={50}
                    left={
                      <div className="h-full overflow-y-auto custom-scrollbar p-4 bg-white dark:bg-gray-900">
                        {isLoadingWorkspaces || isLoadingFiles ? (
                          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                            <RefreshCw className="w-6 h-6 mb-3 animate-spin" />
                            <p className="text-sm">Loading...</p>
                          </div>
                        ) : !activeWorkspace ? (
                          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                            <Folder className="w-10 h-10 mb-3 opacity-50" />
                            <p className="text-sm">No workspace found</p>
                            {selectedAnswerLabel !== 'current' && (
                              <p className="text-xs text-amber-500 mt-1">Historical snapshot not available</p>
                            )}
                          </div>
                        ) : workspaceFiles.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                            <Folder className="w-10 h-10 mb-3 opacity-50" />
                            <p className="text-sm">No files</p>
                          </div>
                        ) : (
                          <div>
                            <div className="mb-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                              <Folder className="w-3 h-3" />
                              <span>{workspaceFiles.length} files</span>
                              <span className={selectedAnswerLabel === 'current' ? 'text-green-500' : 'text-amber-500'}>
                                ({selectedAnswerLabel === 'current' ? 'final' : 'historical'})
                              </span>
                            </div>
                            {fileTree.map((node) => (
                              <FileNode key={node.path} node={node} depth={0} onFileClick={handleFileClick} />
                            ))}
                          </div>
                        )}
                      </div>
                    }
                    right={
                      <div className="h-full overflow-hidden p-4 relative">
                        {selectedFilePath && activeWorkspace ? (
                          <InlineArtifactPreview
                            filePath={selectedFilePath}
                            workspacePath={activeWorkspace.path}
                            onClose={handleInlinePreviewClose}
                            onFullscreen={() => setIsPreviewFullscreen(true)}
                            onFileNotFound={handleInlinePreviewClose}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-gray-500 bg-gray-100 dark:bg-gray-800/30 rounded-lg border border-gray-200 dark:border-gray-700">
                            <Eye className="w-12 h-12 mb-4 opacity-30" />
                            <p className="text-sm">Select a file to preview</p>
                            <p className="text-xs text-gray-400 mt-1">Click any file in the tree</p>
                          </div>
                        )}
                      </div>
                    }
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fullscreen Preview Modal */}
        <AnimatePresence>
          {isPreviewFullscreen && selectedFilePath && activeWorkspace && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8"
              onClick={() => setIsPreviewFullscreen(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full h-full max-w-7xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Fullscreen header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <File className="w-4 h-4" />
                    <span className="font-medium">{selectedFilePath}</span>
                  </div>
                  <button
                    onClick={() => setIsPreviewFullscreen(false)}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500 dark:text-gray-400"
                    title="Close fullscreen"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {/* Fullscreen preview content */}
                <div className="flex-1 overflow-hidden p-4">
                  <InlineArtifactPreview
                    filePath={selectedFilePath}
                    workspacePath={activeWorkspace.path}
                    onClose={() => setIsPreviewFullscreen(false)}
                    onFileNotFound={() => {
                      setSelectedFilePath('')
                      setIsPreviewFullscreen(false)
                    }}
                  />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Follow-up Input Footer */}
      {onFollowUp && (
        <footer className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-6 py-4">
          <form onSubmit={handleFollowUpSubmit} className="max-w-4xl mx-auto flex gap-4">
            <input
              type="text"
              value={followUpQuestion}
              onChange={(e) => setFollowUpQuestion(e.target.value)}
              placeholder="Ask a follow-up question..."
              disabled={!isConnected}
              className="flex-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3
                       text-gray-900 dark:text-gray-100 placeholder-gray-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!followUpQuestion.trim() || !isConnected}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-400 dark:disabled:bg-gray-600
                       disabled:cursor-not-allowed rounded-lg transition-colors text-white
                       flex items-center gap-2"
            >
              <Send className="w-5 h-5" />
              <span>Continue</span>
            </button>
          </form>
        </footer>
      )}

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowShareModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Share Session</h2>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {isSharing && (
                <div className="flex flex-col items-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-cyan-500 mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">Uploading to GitHub Gist...</p>
                </div>
              )}

              {shareError && !isSharing && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
                  <p className="text-red-600 dark:text-red-300 text-sm">{shareError}</p>
                  <p className="text-red-500 dark:text-red-400 text-xs mt-2">
                    Make sure GitHub CLI (gh) is installed and authenticated.
                  </p>
                </div>
              )}

              {shareResult && !isSharing && (
                <div className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4">
                    <p className="text-green-600 dark:text-green-300 text-sm font-medium mb-2">
                      {shareResult.message}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={shareResult.url}
                        readOnly
                        className="flex-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                      />
                      <button
                        onClick={handleCopyShareLink}
                        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors text-white text-sm flex items-center gap-2"
                      >
                        {shareLinkCopied ? (
                          <>
                            <Check className="w-4 h-4" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <a
                    href={shareResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors text-gray-700 dark:text-gray-200 text-sm"
                  >
                    Open in New Tab →
                  </a>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comparison View Modal */}
      <ComparisonView
        isOpen={isComparisonOpen}
        onClose={() => setIsComparisonOpen(false)}
        agentWorkspaces={workspacesByAgent}
        answerWorkspaces={answerWorkspaces}
        agentOrder={agentOrder}
        sessionId={sessionId}
        initialFile={selectedFilePath}
      />
    </motion.div>
  );
}

export default FinalAnswerView;
