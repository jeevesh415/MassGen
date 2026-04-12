import { useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReviewStore, type ParsedFileEntry } from '../../../stores/v2/reviewStore';

const STATUS_COLORS: Record<string, string> = {
  M: 'text-yellow-400 bg-yellow-900/30',
  A: 'text-green-400 bg-green-900/30',
  D: 'text-red-400 bg-red-900/30',
};

const STATUS_LABELS: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
};

/** Render a single diff line with appropriate coloring. */
function DiffLine({ line, lineNum }: { line: string; lineNum: number }) {
  let bg = '';
  let textColor = 'text-zinc-300';

  if (line.startsWith('+') && !line.startsWith('+++')) {
    bg = 'bg-green-900/20';
    textColor = 'text-green-300';
  } else if (line.startsWith('-') && !line.startsWith('---')) {
    bg = 'bg-red-900/20';
    textColor = 'text-red-300';
  } else if (line.startsWith('@@')) {
    bg = 'bg-blue-900/15';
    textColor = 'text-blue-300';
  } else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
    textColor = 'text-zinc-500';
  }

  return (
    <div className={`flex ${bg} hover:bg-zinc-700/30`}>
      <span className="flex-shrink-0 w-12 text-right pr-3 text-zinc-600 select-none text-xs leading-5">
        {lineNum}
      </span>
      <pre className={`flex-1 text-xs leading-5 ${textColor} whitespace-pre overflow-x-auto`}>
        {line}
      </pre>
    </div>
  );
}

/** File list entry in the left panel. */
function FileEntry({
  file,
  isSelected,
  isApproved,
  onSelect,
  onToggle,
}: {
  file: ParsedFileEntry;
  isSelected: boolean;
  isApproved: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const statusClass = STATUS_COLORS[file.status] || '';
  const fileName = file.path.split('/').pop() || file.path;
  const dirPath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '';

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
        isSelected ? 'bg-zinc-700/50 border-l-2 border-blue-500' : 'border-l-2 border-transparent hover:bg-zinc-800/50'
      }`}
      onClick={onSelect}
    >
      <input
        type="checkbox"
        checked={isApproved}
        onChange={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer flex-shrink-0"
      />
      <span className={`px-1 py-0.5 rounded text-[10px] font-mono font-bold flex-shrink-0 ${statusClass}`}>
        {file.status}
      </span>
      <div className="flex-1 min-w-0 truncate">
        <span className="text-sm text-zinc-200">{fileName}</span>
        {dirPath && (
          <span className="text-xs text-zinc-500 ml-1">{dirPath}/</span>
        )}
      </div>
    </div>
  );
}

export function ReviewModal() {
  const isOpen = useReviewStore((s) => s.isOpen);
  const parsedFiles = useReviewStore((s) => s.parsedFiles);
  const fileApprovals = useReviewStore((s) => s.fileApprovals);
  const selectedFile = useReviewStore((s) => s.selectedFile);
  const toggleFile = useReviewStore((s) => s.toggleFile);
  const toggleAllFiles = useReviewStore((s) => s.toggleAllFiles);
  const setSelectedFile = useReviewStore((s) => s.setSelectedFile);
  const submitDecision = useReviewStore((s) => s.submitDecision);

  const selectedEntry = useMemo(
    () => parsedFiles.find((f) => f.key === selectedFile),
    [parsedFiles, selectedFile]
  );

  const diffLines = useMemo(
    () => (selectedEntry?.diff || '').split('\n'),
    [selectedEntry]
  );

  const approvedCount = useMemo(
    () => parsedFiles.filter((f) => fileApprovals[f.key]).length,
    [parsedFiles, fileApprovals]
  );

  const stats = useMemo(() => {
    const m = parsedFiles.filter((f) => f.status === 'M').length;
    const a = parsedFiles.filter((f) => f.status === 'A').length;
    const d = parsedFiles.filter((f) => f.status === 'D').length;
    return { modified: m, added: a, deleted: d };
  }, [parsedFiles]);

  const handleApprove = useCallback(() => {
    submitDecision('approve');
  }, [submitDecision]);

  const handleReject = useCallback(() => {
    submitDecision('reject');
  }, [submitDecision]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col bg-zinc-900/98 backdrop-blur-sm"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-700/50">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-zinc-100">Review Changes</h2>
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              {stats.modified > 0 && (
                <span className="text-yellow-400">{stats.modified} modified</span>
              )}
              {stats.added > 0 && (
                <span className="text-green-400">{stats.added} added</span>
              )}
              {stats.deleted > 0 && (
                <span className="text-red-400">{stats.deleted} deleted</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <button
              onClick={() => toggleAllFiles(true)}
              className="px-2 py-1 rounded hover:bg-zinc-700/50 transition-colors"
            >
              Select All
            </button>
            <button
              onClick={() => toggleAllFiles(false)}
              className="px-2 py-1 rounded hover:bg-zinc-700/50 transition-colors"
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Body: File list + Diff viewer */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel: File list */}
          <div className="w-72 flex-shrink-0 border-r border-zinc-700/50 overflow-y-auto">
            {parsedFiles.map((file) => (
              <FileEntry
                key={file.key}
                file={file}
                isSelected={selectedFile === file.key}
                isApproved={fileApprovals[file.key] ?? true}
                onSelect={() => setSelectedFile(file.key)}
                onToggle={() => toggleFile(file.key)}
              />
            ))}
            {parsedFiles.length === 0 && (
              <div className="p-4 text-sm text-zinc-500">No files changed</div>
            )}
          </div>

          {/* Right panel: Diff viewer */}
          <div className="flex-1 overflow-y-auto bg-zinc-950/50">
            {selectedEntry ? (
              <div>
                {/* File header */}
                <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-zinc-900 border-b border-zinc-700/30">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${STATUS_COLORS[selectedEntry.status] || ''}`}>
                    {selectedEntry.status}
                  </span>
                  <span className="text-sm font-mono text-zinc-200">{selectedEntry.path}</span>
                  <span className="text-xs text-zinc-500">{STATUS_LABELS[selectedEntry.status] || ''}</span>
                </div>
                {/* Diff lines */}
                <div className="font-mono">
                  {diffLines.map((line, i) => (
                    <DiffLine key={i} line={line} lineNum={i + 1} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                Select a file to view its diff
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-700/50">
          <span className="text-sm text-zinc-400">
            {approvedCount} of {parsedFiles.length} file{parsedFiles.length !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReject}
              className="px-4 py-2 text-sm font-medium text-red-400 bg-red-900/20 rounded-md hover:bg-red-900/40 transition-colors border border-red-800/30"
            >
              Reject All
            </button>
            <button
              onClick={handleApprove}
              disabled={approvedCount === 0}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors border ${
                approvedCount > 0
                  ? 'text-green-400 bg-green-900/20 hover:bg-green-900/40 border-green-800/30'
                  : 'text-zinc-600 bg-zinc-800/50 border-zinc-700/30 cursor-not-allowed'
              }`}
            >
              Apply ({approvedCount})
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
