import { useState, useEffect } from 'react';

interface ConfigViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  configPath: string;
}

export function ConfigViewerModal({ isOpen, onClose, configPath }: ConfigViewerModalProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !configPath) return;
    setLoading(true);
    setError(null);

    fetch(`/api/config/content?path=${encodeURIComponent(configPath)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [isOpen, configPath]);

  if (!isOpen) return null;

  const configName = configPath.split('/').pop() || 'config.yaml';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] bg-v2-surface-raised border border-v2-border rounded-v2-modal shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-v2-border-subtle">
          <div className="flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-v2-text-muted"
            >
              <path d="M3 2h7l3 3v9H3V2z" />
              <path d="M10 2v3h3" />
            </svg>
            <span className="text-sm font-medium text-v2-text">{configName}</span>
          </div>
          <button
            onClick={onClose}
            className="text-v2-text-muted hover:text-v2-text text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto v2-scrollbar p-4">
          {loading && (
            <div className="flex items-center justify-center h-32 text-v2-text-muted text-sm">
              Loading...
            </div>
          )}
          {error && <div className="text-red-400 text-sm">Failed to load config: {error}</div>}
          {!loading && !error && (
            <pre className="text-xs font-mono text-v2-text-secondary whitespace-pre leading-relaxed">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
