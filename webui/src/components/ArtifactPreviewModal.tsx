/**
 * ArtifactPreviewModal Component
 *
 * Modal dialog for previewing various artifact types.
 * Automatically detects file type and renders appropriate preview.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Eye, Code, Download, Copy, Check } from 'lucide-react';
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

interface ArtifactPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  workspacePath: string;
}

type ViewMode = 'preview' | 'source';

// Get file name from path
function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

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
 * Fetch workspace file list
 */
async function fetchWorkspaceFiles(workspacePath: string): Promise<string[]> {
  try {
    const response = await fetch(`/api/workspace/browse?path=${encodeURIComponent(workspacePath)}`);
    if (!response.ok) return [];
    const data = await response.json();
    // Extract file paths from the response
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

export function ArtifactPreviewModal({
  isOpen,
  onClose,
  filePath,
  workspacePath,
}: ArtifactPreviewModalProps) {
  const { content, isLoading, error, fetchFile, clearContent } = useFileContent();
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [relatedFiles, setRelatedFiles] = useState<Record<string, string>>({});

  // Detect artifact type
  const artifactType = useMemo((): ArtifactType => {
    if (!content) return 'code';
    const detected = detectArtifactType(filePath, content.mimeType, content.content);
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

  // Fetch file when modal opens
  useEffect(() => {
    if (isOpen && filePath && workspacePath) {
      fetchFile(filePath, workspacePath);
      setViewMode('preview'); // Default to preview mode
    }
  }, [isOpen, filePath, workspacePath, fetchFile]);

  // Ensure binary videos snap back to preview mode when detected
  useEffect(() => {
    if (artifactType === 'video') {
      setViewMode('preview');
    }
  }, [artifactType]);

  // Clear content when modal closes
  useEffect(() => {
    if (!isOpen) {
      clearContent();
      setHighlightedHtml('');
      setCopied(false);
      setRelatedFiles({});
    }
  }, [isOpen, clearContent]);

  // Fetch ALL CSS/JS files from workspace for HTML previews
  // This handles any project structure without complex path resolution
  useEffect(() => {
    async function fetchAllWebAssets() {
      if (!content?.content || artifactType !== 'html') {
        return;
      }

      // Get list of all files in workspace
      const allFiles = await fetchWorkspaceFiles(workspacePath);

      // Filter for CSS and JS files
      const webAssets = allFiles.filter(isWebAsset);
      if (webAssets.length === 0) return;

      const fileMap: Record<string, string> = {};

      // Fetch all CSS/JS files
      await Promise.all(
        webAssets.map(async (assetPath) => {
          const fileData = await fetchSingleFile(assetPath, workspacePath);
          if (fileData?.content) {
            // Store by multiple keys for flexible matching:
            // 1. Full path (e.g., "css/style.css")
            // 2. Just filename (e.g., "style.css")
            // 3. Path without leading slash
            const fileName = assetPath.split('/').pop() || assetPath;
            fileMap[assetPath] = fileData.content;
            fileMap[fileName] = fileData.content;
            // Also store without leading ./
            const cleanPath = assetPath.replace(/^\.?\//, '');
            fileMap[cleanPath] = fileData.content;
          }
        })
      );

      setRelatedFiles(fileMap);
    }

    fetchAllWebAssets();
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

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Render preview based on artifact type
  const renderPreview = useCallback(() => {
    if (!content?.content) return null;

    const fileName = getFileName(filePath);

    switch (artifactType) {
      case 'html':
        return <HtmlPreview content={content.content} fileName={fileName} relatedFiles={relatedFiles} />;
      case 'svg':
        return <SvgPreview content={content.content} fileName={fileName} />;
      case 'image':
        return (
          <ImagePreview content={content.content} fileName={fileName} mimeType={content.mimeType} />
        );
      case 'markdown':
        return <MarkdownPreview content={content.content} fileName={fileName} />;
      case 'pdf':
        return <PdfPreview content={content.content} fileName={fileName} />;
      case 'mermaid':
        return <MermaidPreview content={content.content} fileName={fileName} />;
      case 'docx':
        return <DocxPreview content={content.content} fileName={fileName} workspacePath={workspacePath} filePath={filePath} />;
      case 'xlsx':
        return <XlsxPreview content={content.content} fileName={fileName} />;
      case 'pptx':
        return <PptxPreview content={content.content} fileName={fileName} workspacePath={workspacePath} filePath={filePath} />;
      case 'video':
        return <VideoPreview content={content.content} fileName={fileName} mimeType={content.mimeType} />;
      case 'react':
        return <SandpackPreview content={content.content} fileName={fileName} />;
      default:
        // Fallback to source view for unsupported types
        return null;
    }
  }, [content, filePath, artifactType, relatedFiles]);

  // Render source code view
  const renderSource = useCallback(() => {
    if (!content?.content) return null;

    if (isHighlighting) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-400">
          <span>Applying syntax highlighting...</span>
        </div>
      );
    }

    if (highlightedHtml) {
      return (
        <div
          className="shiki-container overflow-auto text-sm leading-relaxed p-4"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      );
    }

    return (
      <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono leading-relaxed overflow-auto p-4">
        {content.content}
      </pre>
    );
  }, [content, highlightedHtml, isHighlighting]);

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
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-4 md:inset-6 lg:inset-8 bg-gray-900 rounded-xl border border-gray-700 shadow-2xl z-[60] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl">{artifactConfig.icon}</span>
                <div className="min-w-0">
                  <h2 className="text-base font-medium text-gray-100 truncate">
                    {getFileName(filePath)}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">
                      {artifactConfig.label}
                    </span>
                    {content && (
                      <>
                        <span>•</span>
                        <span>{formatFileSize(content.size)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* View mode toggle */}
                {artifactConfig.canPreview && (
                  <div className="flex items-center bg-gray-700 rounded-lg p-0.5">
                    <button
                      onClick={() => setViewMode('preview')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                        viewMode === 'preview'
                          ? 'bg-gray-600 text-gray-100'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <Eye className="w-4 h-4" />
                      <span>Preview</span>
                    </button>
                    <button
                      onClick={() => setViewMode('source')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                        viewMode === 'source'
                          ? 'bg-gray-600 text-gray-100'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <Code className="w-4 h-4" />
                      <span>Source</span>
                    </button>
                  </div>
                )}

                {/* Copy button */}
                {content && !content.binary && content.content && (
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-gray-300"
                    title="Copy to clipboard"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-green-400" />
                        <span className="text-green-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                )}

                {/* Download button */}
                {content && content.content && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-gray-300"
                    title="Download file"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download</span>
                  </button>
                )}

                {/* Close button */}
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-gray-200"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto bg-[#0d1117]">
              {isLoading && (
                <div className="flex items-center justify-center h-64 text-gray-400">
                  <span>Loading file...</span>
                </div>
              )}

              {error && (
                (error.toLowerCase().includes('not found') || error.includes('404')) ? (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                    <span className="font-medium">File moved or removed</span>
                    <span className="text-sm text-gray-500 mt-1">Select another file to continue browsing</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-red-400">
                    <span className="font-medium">Failed to load file</span>
                    <span className="text-sm text-gray-500 mt-1">{error}</span>
                  </div>
                )
              )}

              {!isLoading && !error && content && (
                <>
                  {viewMode === 'preview' && artifactConfig.canPreview ? (
                    renderPreview() || renderSource()
                  ) : (
                    renderSource()
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default ArtifactPreviewModal;
