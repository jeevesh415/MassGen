/**
 * FileViewerModal Component
 *
 * Modal dialog for viewing file contents with syntax highlighting.
 * Uses Shiki for VS Code-quality syntax highlighting.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, FileText, AlertCircle, Loader2, File } from 'lucide-react';
import { codeToHtml } from 'shiki';
import { useFileContent } from '../hooks/useFileContent';

interface FileViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  workspacePath: string;
}

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Get file name from path
function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

export function FileViewerModal({ isOpen, onClose, filePath, workspacePath }: FileViewerModalProps) {
  const { content, isLoading, error, fetchFile, clearContent } = useFileContent();
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const [isHighlighting, setIsHighlighting] = useState(false);

  // Fetch file when modal opens
  useEffect(() => {
    if (isOpen && filePath && workspacePath) {
      fetchFile(filePath, workspacePath);
    }
  }, [isOpen, filePath, workspacePath, fetchFile]);

  // Clear content when modal closes
  useEffect(() => {
    if (!isOpen) {
      clearContent();
      setHighlightedHtml('');
      setCopied(false);
    }
  }, [isOpen, clearContent]);

  // Apply syntax highlighting when content changes
  useEffect(() => {
    async function highlight() {
      if (!content || content.binary || !content.content) {
        setHighlightedHtml('');
        return;
      }

      setIsHighlighting(true);
      try {
        // Map our language names to Shiki language IDs
        const languageMap: Record<string, string> = {
          'plaintext': 'text',
          'gitignore': 'text',
          'dotenv': 'shell',
          'dockerfile': 'docker',
        };

        const lang = languageMap[content.language] || content.language;

        const html = await codeToHtml(content.content, {
          lang: lang,
          theme: 'github-dark',
        });
        setHighlightedHtml(html);
      } catch (err) {
        // Fallback to plain text if highlighting fails
        console.warn('Syntax highlighting failed:', err);
        setHighlightedHtml('');
      } finally {
        setIsHighlighting(false);
      }
    }

    highlight();
  }, [content]);

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

  // Memoize the content display
  const contentDisplay = useMemo(() => {
    const isMissingFile = !!error && (error.toLowerCase().includes('not found') || error.includes('404'))

    if (isLoading || isHighlighting) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3" />
          <p>{isLoading ? 'Loading file...' : 'Applying syntax highlighting...'}</p>
        </div>
      );
    }

    if (error) {
      if (isMissingFile) {
        return (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <File className="w-12 h-12 mb-3 opacity-60" />
            <p className="font-medium">File moved or removed</p>
            <p className="text-sm text-gray-500 mt-1">Select another file to continue browsing</p>
          </div>
        )
      }

      return (
        <div className="flex flex-col items-center justify-center h-64 text-red-400">
          <AlertCircle className="w-12 h-12 mb-3" />
          <p className="font-medium">Failed to load file</p>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
        </div>
      );
    }

    if (!content) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <File className="w-12 h-12 mb-3 opacity-50" />
          <p>No file selected</p>
        </div>
      );
    }

    if (content.binary) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
          <FileText className="w-12 h-12 mb-3" />
          <p className="font-medium">Binary file</p>
          <p className="text-sm text-gray-500 mt-1">
            This file cannot be displayed ({formatFileSize(content.size)})
          </p>
        </div>
      );
    }

    if (highlightedHtml) {
      return (
        <div
          className="shiki-container overflow-auto text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      );
    }

    // Fallback to plain text
    return (
      <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono leading-relaxed overflow-auto">
        {content.content}
      </pre>
    );
  }, [isLoading, isHighlighting, error, content, highlightedHtml]);

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
            className="fixed inset-4 md:inset-8 lg:inset-12 bg-gray-900 rounded-xl border border-gray-700 shadow-2xl z-[60] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-base font-medium text-gray-100 truncate">
                    {getFileName(filePath)}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="truncate">{filePath}</span>
                    {content && !content.binary && (
                      <>
                        <span>•</span>
                        <span>{formatFileSize(content.size)}</span>
                        <span>•</span>
                        <span className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">
                          {content.language}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
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
            <div className="flex-1 overflow-auto p-4 bg-[#0d1117]">
              {contentDisplay}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default FileViewerModal;
