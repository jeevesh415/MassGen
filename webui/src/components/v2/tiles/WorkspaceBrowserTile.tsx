import { useState, useEffect, useMemo, useRef } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { ChevronDown, ExternalLink, Eye, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useWorkspaceStore, type WorkspaceFileInfo } from '../../../stores/workspaceStore';
import { useAgentStore } from '../../../stores/agentStore';
import { useTileStore } from '../../../stores/v2/tileStore';
import { getAgentColor } from '../../../utils/agentColors';
import { canPreviewFile } from '../../../utils/artifactTypes';
import {
  getAgentIdFromWorkspacePath,
  getAgentWorkspaceLabel,
  getWorkspaceVersionOptions,
} from '../../../utils/workspaceBrowser';
import { InlineArtifactPreview } from '../../InlineArtifactPreview';

interface WorkspaceBrowserTileProps {
  initialWorkspacePath?: string;
}

interface AgentWorkspaceOption {
  agentId: string;
  versions: Array<{
    value: string;
    label: string;
    kind: 'live' | 'historical';
  }>;
}

export function WorkspaceBrowserTile({ initialWorkspacePath }: WorkspaceBrowserTileProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const agentOrder = useAgentStore((s) => s.agentOrder);
  const answers = useAgentStore((s) => s.answers);
  const addTile = useTileStore((s) => s.addTile);

  const workspacePaths = Object.keys(workspaces);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<WorkspaceFileInfo | null>(null);
  const [historicalFilesByPath, setHistoricalFilesByPath] = useState<Record<string, WorkspaceFileInfo[]>>({});
  const lastAutoPreviewKeyRef = useRef<string | null>(null);

  const agentWorkspaceOptions = useMemo((): AgentWorkspaceOption[] => {
    const liveWorkspaceByAgent = new Map<string, string>();
    const unmatchedWorkspacePaths: string[] = [];

    for (const path of workspacePaths) {
      const agentId =
        workspaces[path]?.agentId ||
        getAgentIdFromWorkspacePath(path, agentOrder, workspacePaths);

      if (!agentId || liveWorkspaceByAgent.has(agentId)) {
        unmatchedWorkspacePaths.push(path);
        continue;
      }
      liveWorkspaceByAgent.set(agentId, path);
    }

    const remainingAgentIds = agentOrder.filter(
      (agentId) => !liveWorkspaceByAgent.has(agentId)
    );
    unmatchedWorkspacePaths.forEach((path, index) => {
      const fallbackAgentId = remainingAgentIds[index];
      if (fallbackAgentId && !liveWorkspaceByAgent.has(fallbackAgentId)) {
        liveWorkspaceByAgent.set(fallbackAgentId, path);
      }
    });

    if (workspacePaths.length === 1 && agentOrder.length === 1 && !liveWorkspaceByAgent.has(agentOrder[0])) {
      liveWorkspaceByAgent.set(agentOrder[0], workspacePaths[0]);
    }

    const orderedAgentIds = [
      ...agentOrder,
      ...answers
        .map((answer) => answer.agentId)
        .filter((agentId, index, list) => !agentOrder.includes(agentId) && list.indexOf(agentId) === index),
    ];

    return orderedAgentIds
      .map((agentId) => ({
        agentId,
        versions: getWorkspaceVersionOptions({
          agentId,
          answers,
          liveWorkspacePath: liveWorkspaceByAgent.get(agentId),
        }),
      }))
      .filter((entry) => entry.versions.length > 0);
  }, [agentOrder, answers, workspacePaths, workspaces]);

  useEffect(() => {
    if (agentWorkspaceOptions.length === 0) {
      setSelectedAgentId('');
      setSelectedWorkspacePath('');
      return;
    }

    const preferredAgentId =
      (initialWorkspacePath
        ? getAgentIdFromWorkspacePath(initialWorkspacePath, agentOrder, workspacePaths)
        : null) ||
      agentWorkspaceOptions.find((entry) =>
        initialWorkspacePath
          ? entry.versions.some((option) => option.value === initialWorkspacePath)
          : false
      )?.agentId ||
      agentWorkspaceOptions[0].agentId;

    if (!selectedAgentId || !agentWorkspaceOptions.some((entry) => entry.agentId === selectedAgentId)) {
      setSelectedAgentId(preferredAgentId);
    }
  }, [agentWorkspaceOptions, agentOrder, initialWorkspacePath, selectedAgentId, workspacePaths]);

  const selectedAgentEntry = useMemo(
    () =>
      agentWorkspaceOptions.find((entry) => entry.agentId === selectedAgentId) ||
      agentWorkspaceOptions[0] ||
      null,
    [agentWorkspaceOptions, selectedAgentId]
  );

  useEffect(() => {
    if (!selectedAgentEntry) {
      setSelectedWorkspacePath('');
      return;
    }

    const availableWorkspacePaths = selectedAgentEntry.versions.map((option) => option.value);
    const preferredWorkspacePath =
      initialWorkspacePath && availableWorkspacePaths.includes(initialWorkspacePath)
        ? initialWorkspacePath
        : selectedAgentEntry.versions[0]?.value || '';

    if (!selectedWorkspacePath || !availableWorkspacePaths.includes(selectedWorkspacePath)) {
      setSelectedWorkspacePath(preferredWorkspacePath);
    }
  }, [initialWorkspacePath, selectedAgentEntry, selectedWorkspacePath]);

  const effectiveWorkspace =
    selectedAgentEntry?.versions.find((option) => option.value === selectedWorkspacePath) ||
    selectedAgentEntry?.versions[0] ||
    null;

  const effectiveWorkspacePath = effectiveWorkspace?.value || '';
  const isHistoricalWorkspace = effectiveWorkspace?.kind === 'historical';

  useEffect(() => {
    if (!isHistoricalWorkspace || !effectiveWorkspacePath || historicalFilesByPath[effectiveWorkspacePath]) {
      return;
    }

    let cancelled = false;

    async function fetchHistoricalFiles() {
      try {
        const response = await fetch(
          `/api/workspace/browse?path=${encodeURIComponent(effectiveWorkspacePath)}`
        );
        if (!response.ok) return;

        const data = await response.json() as {
          files?: WorkspaceFileInfo[];
        };

        if (cancelled) return;

        setHistoricalFilesByPath((current) => ({
          ...current,
          [effectiveWorkspacePath]: data.files || [],
        }));
      } catch {
        if (!cancelled) {
          setHistoricalFilesByPath((current) => ({
            ...current,
            [effectiveWorkspacePath]: [],
          }));
        }
      }
    }

    void fetchHistoricalFiles();

    return () => {
      cancelled = true;
    };
  }, [effectiveWorkspacePath, historicalFilesByPath, isHistoricalWorkspace]);

  const files = isHistoricalWorkspace
    ? historicalFilesByPath[effectiveWorkspacePath] || []
    : workspaces[effectiveWorkspacePath]?.files || [];

  // Clear selected file when workspace changes
  useEffect(() => {
    setSelectedFile(null);
  }, [effectiveWorkspacePath]);

  useEffect(() => {
    if (selectedFile && !files.some((file) => file.path === selectedFile.path)) {
      setSelectedFile(null);
    }
  }, [files, selectedFile]);

  useEffect(() => {
    if (selectedFile) return;

    const mainPreviewableFile = findMainPreviewableFile(files);
    if (!mainPreviewableFile) return;

    const autoPreviewKey = `${effectiveWorkspacePath}:${mainPreviewableFile.path}`;
    if (lastAutoPreviewKeyRef.current === autoPreviewKey) return;

    lastAutoPreviewKeyRef.current = autoPreviewKey;
    setSelectedFile(mainPreviewableFile);
  }, [effectiveWorkspacePath, files, selectedFile]);

  const handleFileClick = (file: WorkspaceFileInfo) => {
    setSelectedFile(file);
  };

  const handleOpenInTile = () => {
    if (!selectedFile || !effectiveWorkspacePath) return;
    addTile({
      id: `file-${selectedFile.path}`,
      type: 'file-viewer',
      targetId: selectedFile.path,
      label: selectedFile.path.split('/').pop() || selectedFile.path,
      workspacePath: effectiveWorkspacePath,
    });
  };

  const wsStatus = useWorkspaceStore((s) => s.wsStatus);
  const sessionId = useAgentStore((s) => s.sessionId);

  if (agentWorkspaceOptions.length === 0) {
    const isWaiting = !!sessionId && (wsStatus === 'connecting' || wsStatus === 'connected');
    return (
      <div className="flex flex-col items-center justify-center h-full text-v2-text-muted text-sm gap-2">
        {isWaiting ? (
          <>
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="8" cy="8" r="6" strokeDasharray="20" strokeDashoffset="5" />
            </svg>
            <span>Waiting for workspace data...</span>
          </>
        ) : (
          <span>No workspace files available</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-v2-base">
      {/* Agent selector + version selector */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-v2-border shrink-0 flex-wrap">
        <div className="flex items-center gap-1">
          {agentWorkspaceOptions.map((entry) => {
            const color = getAgentColor(entry.agentId, agentOrder);
            const isSelected = entry.agentId === selectedAgentEntry?.agentId;
            return (
              <button
                key={entry.agentId}
                onClick={() => {
                  setSelectedAgentId(entry.agentId);
                  setSelectedWorkspacePath(entry.versions[0]?.value || '');
                }}
                className={cn(
                  'px-2 py-1 text-xs rounded transition-colors',
                  isSelected
                    ? 'text-v2-text font-medium'
                    : 'text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover'
                )}
                style={
                  isSelected && color
                    ? { backgroundColor: `${color.hex}20` }
                    : undefined
                }
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: color?.hex || '#80848E' }}
                />
                {getAgentWorkspaceLabel(entry.agentId, agentOrder)}
              </button>
            );
          })}
        </div>

        {selectedAgentEntry && (
          <div className="flex items-center gap-2 ml-auto">
            <label
              htmlFor="workspace-version"
              className="text-xs font-medium text-v2-text-muted uppercase tracking-wide"
            >
              Version
            </label>
            <div className="relative">
              <select
                id="workspace-version"
                aria-label="Version"
                value={effectiveWorkspacePath}
                onChange={(event) => setSelectedWorkspacePath(event.target.value)}
                className={cn(
                  'appearance-none rounded border border-v2-border bg-v2-surface',
                  'px-2.5 py-1 pr-7 text-xs text-v2-text focus:outline-none'
                )}
                disabled={selectedAgentEntry.versions.length <= 1}
              >
                {selectedAgentEntry.versions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-v2-text-muted" />
            </div>
          </div>
        )}
      </div>

      {/* Main content: side-by-side tree (left) + preview (right) */}
      <Group orientation="horizontal" className="flex-1 min-h-0">
        <Panel id="file-tree" defaultSize={25} minSize={15}>
          <div className="h-full overflow-auto v2-scrollbar border-r border-v2-border">
            <FileTree
              files={files}
              onFileClick={handleFileClick}
              selectedPath={selectedFile?.path || null}
            />
          </div>
        </Panel>
        <Separator
          className={cn(
            'w-[2px] bg-v2-border transition-colors duration-150',
            'hover:bg-v2-accent'
          )}
        />
        <Panel id="file-preview" defaultSize={75} minSize={40}>
          {selectedFile ? (
            <FilePreview
              file={selectedFile}
              workspacePath={effectiveWorkspacePath}
              onOpenInTile={handleOpenInTile}
              onClose={() => setSelectedFile(null)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-v2-text-muted text-sm">
              Select a file to preview
            </div>
          )}
        </Panel>
      </Group>
    </div>
  );
}

// ============================================================================
// File Preview
// ============================================================================

interface FilePreviewProps {
  file: WorkspaceFileInfo;
  workspacePath: string;
  onOpenInTile: () => void;
  onClose: () => void;
}

function FilePreview({ file, workspacePath, onOpenInTile, onClose }: FilePreviewProps) {
  return (
    <div className="flex flex-col h-full bg-v2-surface">
      {/* Preview header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-v2-border shrink-0">
        <span className="text-xs text-v2-text-secondary truncate">{file.path}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onOpenInTile}
            className="p-1 text-v2-text-muted hover:text-v2-text transition-colors rounded hover:bg-v2-sidebar-hover"
            title="Open in new tile"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-v2-text-muted hover:text-v2-text transition-colors rounded hover:bg-v2-sidebar-hover"
            title="Close preview"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content — rendered via InlineArtifactPreview */}
      <div className="flex-1 overflow-auto v2-scrollbar">
        <InlineArtifactPreview
          filePath={file.path}
          workspacePath={workspacePath}
          onFileNotFound={onClose}
        />
      </div>
    </div>
  );
}

// ============================================================================
// File Tree
// ============================================================================

interface FileTreeProps {
  files: WorkspaceFileInfo[];
  onFileClick: (file: WorkspaceFileInfo) => void;
  selectedPath: string | null;
}

function FileTree({ files, onFileClick, selectedPath }: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-v2-text-muted text-sm">
        No files in workspace
      </div>
    );
  }

  return (
    <div className="py-1">
      {tree.children.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          onFileClick={onFileClick}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Tree Node
// ============================================================================

interface TreeNodeData {
  name: string;
  path: string;
  isDir: boolean;
  file?: WorkspaceFileInfo;
  children: TreeNodeData[];
}

interface TreeNodeProps {
  node: TreeNodeData;
  depth: number;
  onFileClick: (file: WorkspaceFileInfo) => void;
  selectedPath: string | null;
}

function TreeNode({ node, depth, onFileClick, selectedPath }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isPreviewable = !!node.file && canPreviewFile(node.file.path);

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            'flex items-center gap-1.5 w-full text-sm text-v2-text-secondary',
            'hover:bg-v2-sidebar-hover hover:text-v2-text',
            'transition-colors duration-100 py-0.5 pr-2'
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <svg
            className={cn('w-3 h-3 shrink-0 transition-transform', expanded && 'rotate-90')}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <svg className="w-3.5 h-3.5 shrink-0 text-v2-text-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 4.5A1.5 1.5 0 013.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5V4.5z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="truncate">{node.name}</span>
        </button>
        {expanded &&
          node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
              selectedPath={selectedPath}
            />
          ))}
      </div>
    );
  }

  const isSelected = selectedPath === node.path;

  return (
    <button
      onClick={() => node.file && onFileClick(node.file)}
      className={cn(
        'flex items-center gap-1.5 w-full text-sm text-v2-text-secondary',
        'hover:bg-v2-sidebar-hover hover:text-v2-text',
        'transition-colors duration-100 py-0.5 pr-2',
        isSelected && 'bg-[var(--v2-channel-active)] text-v2-text',
        isPreviewable && !isSelected && 'text-v2-text'
      )}
      style={{ paddingLeft: `${depth * 16 + 8 + 15}px` }}
    >
      <FileIcon name={node.name} />
      <span className="truncate">{node.name}</span>
      {isPreviewable && (
        <span
          aria-label="Rich preview available"
          title="Rich preview available"
          className="shrink-0 text-v2-accent"
        >
          <Eye className="w-3.5 h-3.5" />
        </span>
      )}
      {node.file && (
        <span className="ml-auto text-[10px] text-v2-text-muted shrink-0">
          {formatSize(node.file.size)}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function buildTree(files: WorkspaceFileInfo[]): TreeNodeData {
  const root: TreeNodeData = { name: '', path: '', isDir: true, children: [] };

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');

      if (isLast) {
        current.children.push({
          name: part,
          path,
          isDir: false,
          file,
          children: [],
        });
      } else {
        let dir = current.children.find((c) => c.isDir && c.name === part);
        if (!dir) {
          dir = { name: part, path, isDir: true, children: [] };
          current.children.push(dir);
        }
        current = dir;
      }
    }
  }

  const sortChildren = (node: TreeNodeData) => {
    node.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortChildren);
  };
  sortChildren(root);

  return root;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function findMainPreviewableFile(files: WorkspaceFileInfo[]): WorkspaceFileInfo | null {
  const previewableFiles = files.filter((file) => canPreviewFile(file.path));
  if (previewableFiles.length === 0) return null;

  const pdf = previewableFiles.find((file) =>
    file.path.toLowerCase().endsWith('.pdf')
  );
  if (pdf) return pdf;

  const pptx = previewableFiles.find((file) =>
    file.path.toLowerCase().endsWith('.pptx')
  );
  if (pptx) return pptx;

  const docx = previewableFiles.find((file) =>
    file.path.toLowerCase().endsWith('.docx')
  );
  if (docx) return docx;

  const indexHtml = previewableFiles.find((file) =>
    file.path.toLowerCase().endsWith('index.html')
  );
  if (indexHtml) return indexHtml;

  const anyHtml = previewableFiles.find((file) =>
    file.path.toLowerCase().endsWith('.html') ||
    file.path.toLowerCase().endsWith('.htm')
  );
  if (anyHtml) return anyHtml;

  const image = previewableFiles.find((file) => {
    const lower = file.path.toLowerCase();
    return (
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.gif') ||
      lower.endsWith('.svg') ||
      lower.endsWith('.webp')
    );
  });
  if (image) return image;

  return previewableFiles[0];
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  const isCode = ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'cpp', 'c', 'h'].includes(ext || '');
  const isConfig = ['json', 'yaml', 'yml', 'toml', 'ini', 'env'].includes(ext || '');
  const isMarkdown = ext === 'md';

  const className = cn(
    'w-3.5 h-3.5 shrink-0',
    isCode ? 'text-blue-400' : isConfig ? 'text-amber-400' : isMarkdown ? 'text-emerald-400' : 'text-v2-text-muted'
  );

  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 2h5l3 3v9H4V2z" strokeLinejoin="round" />
      <path d="M9 2v3h3" strokeLinejoin="round" />
    </svg>
  );
}
