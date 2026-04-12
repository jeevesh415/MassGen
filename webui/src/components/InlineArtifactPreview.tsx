/**
 * InlineArtifactPreview Component
 *
 * Renders artifact preview inline (not in modal).
 * Used for split-view workspace browsing.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Loader2, AlertCircle, Eye, Code, X, Download, Copy, Check, Maximize2, ExternalLink } from 'lucide-react';
import { codeToHtml } from 'shiki';
import { useFileContent } from '../hooks/useFileContent';
import { detectArtifactType, getArtifactConfig, type ArtifactType } from '../utils/artifactTypes';
import type { FileContentResponse } from '../types';
import {
  HtmlPreview,
  SvgPreview,
  ImagePreview,
  MarkdownPreview,
  PdfPreview,
  MermaidPreview,
  DocxPreview,
  XlsxPreview,
  PptxPreview,
  VideoPreview,
  SandpackPreview,
} from './artifactRenderers';

interface InlineArtifactPreviewProps {
  filePath: string;
  workspacePath: string;
  onClose?: () => void;
  onFullscreen?: () => void;
  // Optional: Enable live HTML preview with working relative links
  sessionId?: string;
  agentId?: string;
  // Optional: Called when file is not found (404) - parent can clear selection
  onFileNotFound?: () => void;
}

type ViewMode = 'preview' | 'source';

// Get file name from path
function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Check if a file is a web asset (CSS or JS)
 */
function isWebAsset(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext === 'css' || ext === 'js';
}

/**
 * Check if a file is an image
 */
function isImageFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext || '');
}

/**
 * Convert base64-encoded content into a Blob for downloads.
 */
function base64ToBlob(base64: string, mimeType?: string): Blob | null {
  try {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType || 'application/octet-stream' });
  } catch (err) {
    console.error('Failed to decode base64 content for download', err);
    return null;
  }
}

/**
 * Fetch workspace file list
 */
async function fetchWorkspaceFiles(workspacePath: string): Promise<string[]> {
  try {
    const response = await fetch(`/api/workspace/browse?path=${encodeURIComponent(workspacePath)}`);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.files || []).map((f: { path: string }) => f.path);
  } catch {
    return [];
  }
}

/**
 * Fetch a single file from workspace
 */
async function fetchSingleFile(filePath: string, workspacePath: string): Promise<FileContentResponse | null> {
  try {
    const params = new URLSearchParams({
      path: filePath,
      workspace: workspacePath,
    });
    const response = await fetch(`/api/workspace/file?${params}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export function InlineArtifactPreview({
  filePath,
  workspacePath,
  onClose,
  onFullscreen,
  sessionId,
  agentId,
  onFileNotFound,
}: InlineArtifactPreviewProps) {
  const { content, isLoading, error, fetchFile, clearContent } = useFileContent();
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [relatedFiles, setRelatedFiles] = useState<Record<string, string>>({});

  // Track scheduled 404 callbacks to prevent stale 404s from clearing selection
  const scheduledNotFoundRef = useRef<string | null>(null);

  // Detect artifact type
  const artifactType = useMemo((): ArtifactType => {
    if (!content) return 'code';
    const detected = detectArtifactType(filePath, content.mimeType, content.content);
    // Force video rendering for binary video payloads even if detection fails
    const lowerPath = filePath.toLowerCase();
    if (
      content.binary &&
      (content.mimeType?.startsWith('video') ||
        lowerPath.endsWith('.mp4') ||
        lowerPath.endsWith('.webm') ||
        lowerPath.endsWith('.mov'))
    ) {
      return 'video';
    }
    return detected;
  }, [filePath, content]);

  const artifactConfig = useMemo(() => getArtifactConfig(artifactType), [artifactType]);

  // Track previous workspace to detect workspace changes
  const prevWorkspaceRef = useRef<string | null>(null);

  // Fetch file when path changes
  useEffect(() => {
    if (filePath && workspacePath) {
      // Detect if workspace changed (not just file path)
      const workspaceChanged = prevWorkspaceRef.current !== null &&
                               prevWorkspaceRef.current !== workspacePath;
      prevWorkspaceRef.current = workspacePath;

      // Clear previous state before fetching new file
      setHighlightedHtml('');
      setCopied(false);
      setRelatedFiles({});

      // Cancel any pending 404 callbacks from previous workspace
      // This prevents stale 404s from clearing the new workspace's file selection
      if (workspaceChanged) {
        scheduledNotFoundRef.current = null;
      }

      // Skip cache if workspace changed to ensure fresh data
      fetchFile(filePath, workspacePath, workspaceChanged);
      setViewMode('preview');
    }
  }, [filePath, workspacePath, fetchFile]);
  // Force preview for detected videos to avoid raw base64 view
  useEffect(() => {
    if (artifactType === 'video') {
      setViewMode('preview');
    }
  }, [artifactType]);

  // Clear content when component unmounts or path becomes empty
  useEffect(() => {
    if (!filePath) {
      clearContent();
      setRelatedFiles({});
    }
  }, [filePath, clearContent]);

  // AbortController for canceling web asset fetches when file changes
  const webAssetAbortRef = useRef<AbortController | null>(null);

  // Fetch CSS/JS/image files for HTML previews
  useEffect(() => {
    // Cancel any previous web asset fetches
    if (webAssetAbortRef.current) {
      webAssetAbortRef.current.abort();
    }

    async function fetchAllWebAssets() {
      if (!content?.content || artifactType !== 'html') {
        return;
      }

      const controller = new AbortController();
      webAssetAbortRef.current = controller;

      try {
        const allFiles = await fetchWorkspaceFiles(workspacePath);
        if (controller.signal.aborted) return;

        const webAssets = allFiles.filter(isWebAsset);
        const imageAssets = allFiles.filter(isImageFile);

        if (webAssets.length === 0 && imageAssets.length === 0) return;

        const fileMap: Record<string, string> = {};

        // Fetch CSS/JS files (text content)
        await Promise.all(
          webAssets.map(async (assetPath) => {
            if (controller.signal.aborted) return;
            const fileData = await fetchSingleFile(assetPath, workspacePath);
            if (controller.signal.aborted) return;
            if (fileData?.content) {
              const fileName = assetPath.split('/').pop() || assetPath;
              fileMap[assetPath] = fileData.content;
              fileMap[fileName] = fileData.content;
              const cleanPath = assetPath.replace(/^\.?\//, '');
              fileMap[cleanPath] = fileData.content;
            }
          })
        );

        if (controller.signal.aborted) return;

        // Fetch image files (binary content as base64 data URLs)
        await Promise.all(
          imageAssets.map(async (assetPath) => {
            if (controller.signal.aborted) return;
            const fileData = await fetchSingleFile(assetPath, workspacePath);
            if (controller.signal.aborted) return;
            if (fileData?.content && fileData.binary) {
              const fileName = assetPath.split('/').pop() || assetPath;
              const mimeType = fileData.mimeType || 'image/png';
              const dataUrl = `data:${mimeType};base64,${fileData.content}`;
              // Store as data URL for all path variations
              fileMap[assetPath] = dataUrl;
              fileMap[fileName] = dataUrl;
              fileMap[`./${assetPath}`] = dataUrl;
              fileMap[`./${fileName}`] = dataUrl;
              const cleanPath = assetPath.replace(/^\.?\//, '');
              fileMap[cleanPath] = dataUrl;
            }
          })
        );

        if (controller.signal.aborted) return;
        setRelatedFiles(fileMap);
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error('Failed to fetch web assets:', err);
      }
    }

    fetchAllWebAssets();

    // Cleanup on unmount or when dependencies change
    return () => {
      if (webAssetAbortRef.current) {
        webAssetAbortRef.current.abort();
      }
    };
  }, [content, artifactType, workspacePath]);

  // Apply syntax highlighting for source view
  useEffect(() => {
    async function highlight() {
      if (!content || content.binary || !content.content || viewMode !== 'source') {
        return;
      }

      setIsHighlighting(true);
      try {
        const languageMap: Record<string, string> = {
          plaintext: 'text',
          gitignore: 'text',
          dotenv: 'shell',
          dockerfile: 'docker',
        };

        const lang = languageMap[content.language] || content.language;
        const html = await codeToHtml(content.content, {
          lang,
          theme: 'github-dark',
        });
        setHighlightedHtml(html);
      } catch (err) {
        console.warn('Syntax highlighting failed:', err);
        setHighlightedHtml('');
      } finally {
        setIsHighlighting(false);
      }
    }

    highlight();
  }, [content, viewMode]);

  // Handle copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!content?.content) return;

    try {
      await navigator.clipboard.writeText(content.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [content]);

  // Handle download
  const handleDownload = useCallback(() => {
    if (!content?.content) return;

    const blob = content.binary
      ? base64ToBlob(content.content, content.mimeType)
      : new Blob([content.content], { type: content.mimeType || 'text/plain' });
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getFileName(filePath);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [content, filePath]);

  // Handle open in new tab
  const handleOpenInNewTab = useCallback(() => {
    if (!content?.content) return;

    // For HTML files, open as rendered HTML
    if (artifactType === 'html') {
      const blob = new Blob([content.content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Note: Can't revoke immediately as it's opened in new tab
      return;
    }

    // For images, open the image directly
    if (artifactType === 'image' && content.binary) {
      const blob = base64ToBlob(content.content, content.mimeType);
      if (blob) {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
      return;
    }

    // For other files, open as plain text/source
    const blob = content.binary
      ? base64ToBlob(content.content, content.mimeType)
      : new Blob([content.content], { type: content.mimeType || 'text/plain' });
    if (blob) {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  }, [content, artifactType]);

  // Render preview based on artifact type
  const renderPreview = useCallback(() => {
    if (!content) return null;

    // For binary files, content.content may be base64 encoded
    if (!content.content && !content.binary) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-v2-text-muted">
          <AlertCircle className="w-8 h-8 mb-3 opacity-50" />
          <span>No content available</span>
        </div>
      );
    }

    const fileName = getFileName(filePath);

    switch (artifactType) {
      case 'html':
        return (
          <HtmlPreview
            content={content.content}
            fileName={fileName}
            relatedFiles={relatedFiles}
            sessionId={sessionId}
            agentId={agentId}
            filePath={filePath}
            workspacePath={workspacePath}
          />
        );
      case 'svg':
        return <SvgPreview content={content.content} fileName={fileName} />;
      case 'image':
        return (
          <ImagePreview
            content={content.content}
            fileName={fileName}
            mimeType={content.mimeType}
          />
        );
      case 'markdown':
        return <MarkdownPreview content={content.content} fileName={fileName} />;
      case 'pdf':
        return <PdfPreview content={content.content} fileName={fileName} />;
      case 'mermaid':
        return <MermaidPreview content={content.content} fileName={fileName} />;
      case 'docx':
        return (
          <DocxPreview
            content={content.content}
            fileName={fileName}
            workspacePath={workspacePath}
            filePath={filePath}
          />
        );
      case 'xlsx':
        return <XlsxPreview content={content.content} fileName={fileName} />;
      case 'pptx':
        return (
          <PptxPreview
            content={content.content}
            fileName={fileName}
            workspacePath={workspacePath}
            filePath={filePath}
          />
        );
      case 'video':
        return (
          <VideoPreview
            content={content.content}
            fileName={fileName}
            mimeType={content.mimeType}
          />
        );
      case 'react':
        return <SandpackPreview content={content.content} fileName={fileName} />;
      case 'code':
      default:
        // For code/unknown types, show source with syntax highlighting
        if (highlightedHtml) {
          return (
            <div
              className="overflow-auto h-full p-4 bg-v2-sidebar text-sm [&_pre]:!bg-transparent [&_code]:!bg-transparent"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          );
        }
        return (
          <pre className="overflow-auto h-full p-4 bg-v2-sidebar text-v2-text-secondary text-sm font-mono whitespace-pre-wrap">
            {content.content}
          </pre>
        );
    }
  }, [content, artifactType, filePath, highlightedHtml, relatedFiles, workspacePath]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-v2-text-muted">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <span>Loading preview...</span>
      </div>
    );
  }

  // Error state - silently recover from 404s, show error for other failures
  if (error) {
    const is404 = error.toLowerCase().includes('not found') || error.includes('404');

    // For 404s: silently clear selection and show empty state
    // This handles race conditions where file was deleted after appearing in list
    if (is404 && onFileNotFound) {
      // Only schedule callback if we haven't already for this file+workspace combo
      // This prevents stale 404s from clearing selection when workspace is changing
      const currentKey = `${workspacePath}:${filePath}`;
      if (scheduledNotFoundRef.current !== currentKey) {
        scheduledNotFoundRef.current = currentKey;
        // Call the callback to clear selection in parent
        // Use setTimeout to avoid state update during render
        setTimeout(() => {
          // Double-check the error is still for this same file/workspace
          // If workspace changed, don't clear selection
          if (scheduledNotFoundRef.current === currentKey) {
            onFileNotFound();
          }
          scheduledNotFoundRef.current = null;
        }, 0);
      }
      // Return empty state while parent updates
      return (
        <div className="flex flex-col items-center justify-center h-full text-v2-text-muted">
          <Eye className="w-12 h-12 mb-4 opacity-50" />
          <span>File moved or removed</span>
          <span className="text-sm mt-1">Choose another file to keep browsing</span>
        </div>
      );
    }

    if (is404) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-v2-text-muted">
          <Eye className="w-12 h-12 mb-4 opacity-50" />
          <span>File moved or removed</span>
          <span className="text-sm mt-1">Refresh or choose another file</span>
        </div>
      );
    }

    // For other errors, show error UI
    return (
      <div className="flex flex-col items-center justify-center h-full text-v2-text-muted">
        <AlertCircle className="w-8 h-8 mb-3 text-red-400" />
        <span className="font-medium text-red-400">Failed to load file</span>
        <span className="text-sm text-v2-text-muted mt-1">{error}</span>
      </div>
    );
  }

  // No file selected
  if (!filePath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-v2-text-muted">
        <Eye className="w-12 h-12 mb-4 opacity-50" />
        <span>Select a file to preview</span>
      </div>
    );
  }

  const fileName = getFileName(filePath);

  return (
    <div className="flex flex-col h-full bg-v2-surface rounded-lg border border-v2-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-v2-sidebar border-b border-v2-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">{artifactConfig.icon}</span>
          <span className="text-sm text-v2-text-secondary truncate" title={fileName}>
            {fileName}
          </span>
          {content && (
            <span className="text-xs text-v2-text-muted">
              ({formatFileSize(content.size)})
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* View mode toggle (for previewable types) */}
          {artifactConfig.canPreview && content && !content.binary && (
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={() => setViewMode('preview')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-v2-accent text-white'
                    : 'text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover'
                }`}
                title="Preview"
              >
                <Eye className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('source')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'source'
                    ? 'bg-v2-accent text-white'
                    : 'text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover'
                }`}
                title="Source"
              >
                <Code className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Copy button */}
          {content && !content.binary && (
            <button
              onClick={handleCopy}
              className="p-1.5 text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover rounded transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          )}

          {/* Download button */}
          {content && (
            <button
              onClick={handleDownload}
              className="p-1.5 text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover rounded transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* Open in new tab button */}
          {content && (
            <button
              onClick={handleOpenInNewTab}
              className="p-1.5 text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover rounded transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          {/* Fullscreen button */}
          {onFullscreen && (
            <button
              onClick={onFullscreen}
              className="p-1.5 text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover rounded transition-colors"
              title="Fullscreen preview"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}

          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover rounded transition-colors ml-1"
              title="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'preview' && artifactConfig.canPreview ? (
          renderPreview()
        ) : (
          // Source view
          <div className="h-full overflow-auto">
            {isHighlighting ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-v2-text-muted" />
              </div>
            ) : highlightedHtml ? (
              <div
                className="p-4 text-sm [&_pre]:!bg-transparent [&_code]:!bg-transparent"
                dangerouslySetInnerHTML={{ __html: highlightedHtml }}
              />
            ) : content?.content ? (
              <pre className="p-4 text-sm text-v2-text-secondary font-mono whitespace-pre-wrap">
                {content.content}
              </pre>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default InlineArtifactPreview;
