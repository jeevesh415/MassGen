import { cn } from '../../../lib/utils';
import { TileState } from '../../../stores/v2/tileStore';
import { useTileStore } from '../../../stores/v2/tileStore';
import { useAgentStore } from '../../../stores/agentStore';
import { getAgentColor } from '../../../utils/agentColors';
import { AgentChannel } from '../channel/AgentChannel';
import { FileViewerTile } from './FileViewerTile';
import { WorkspaceBrowserTile } from './WorkspaceBrowserTile';
import { TimelineTile } from './TimelineTile';
import { VoteResultsTile } from './VoteResultsTile';
import { AnswerBrowserTile } from './AnswerBrowserTile';
import { SubagentTile } from './SubagentTile';
import { InlineArtifactPreview } from '../../InlineArtifactPreview';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { TileDragContext } from './TileDragContext';
import { TileDragHandle } from './TileDragHandle';

interface TileWrapperProps {
  tile: TileState;
  isActive: boolean;
  showClose: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function TileWrapper({ tile, isActive, showClose, onDragStart, onDragEnd }: TileWrapperProps) {
  const removeTile = useTileStore((s) => s.removeTile);
  const agentOrder = useAgentStore((s) => s.agentOrder);

  // Agent channels have their own header — skip tile header for them
  const skipTileHeader = tile.type === 'agent-channel';

  // Agent color ring for active channel tiles in multi-agent view
  let ringStyle: React.CSSProperties | undefined;
  if (isActive && showClose && tile.type === 'agent-channel') {
    const color = getAgentColor(tile.targetId, agentOrder);
    ringStyle = { boxShadow: `inset 0 0 0 1px ${color.hex}40` };
  }

  return (
    <TileDragContext.Provider value={{ tileId: tile.id, isDraggable: showClose }}>
      <div
        className={cn(
          'flex flex-col h-full',
          isActive && showClose && !ringStyle && 'ring-1 ring-v2-accent/30 ring-inset'
        )}
        style={ringStyle}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        {/* Tile header — only for non-channel tiles (files, artifacts, etc.) */}
        {!skipTileHeader && (
          <div className="flex items-center h-10 px-3 bg-v2-surface border-b border-v2-border shrink-0">
            <TileDragHandle />
            {showClose && <div className="w-1.5" />}
            <TileIcon type={tile.type} />
            <span className="ml-2 text-sm font-medium text-v2-text truncate">
              {tile.label}
            </span>
            <div className="flex-1" />
            {showClose && (
              <button
                onClick={() => removeTile(tile.id)}
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded',
                  'text-v2-text-muted hover:text-v2-text hover:bg-v2-sidebar-hover',
                  'transition-colors duration-150'
                )}
                title="Close tile"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Tile content */}
        <div className="flex-1 overflow-hidden">
          <TileContent tile={tile} />
        </div>
      </div>
    </TileDragContext.Provider>
  );
}

function TileContent({ tile }: { tile: TileState }) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspacePath = tile.workspacePath || Object.keys(workspaces)[0] || '';

  switch (tile.type) {
    case 'agent-channel':
      return <AgentChannel agentId={tile.targetId} />;
    case 'file-viewer':
      return <FileViewerTile filePath={tile.targetId} workspacePath={tile.workspacePath} />;
    case 'artifact-preview':
      return workspacePath ? (
        <div className="h-full overflow-auto v2-scrollbar bg-v2-surface">
          <InlineArtifactPreview filePath={tile.targetId} workspacePath={workspacePath} />
        </div>
      ) : (
        <div className="p-4 text-v2-text-muted text-sm">
          No workspace available
        </div>
      );
    case 'subagent-view':
      return <SubagentTile subagentId={tile.targetId} />;
    case 'timeline-view':
      return <TimelineTile />;
    case 'workspace-browser':
      return <WorkspaceBrowserTile initialWorkspacePath={tile.targetId !== 'workspace' ? tile.targetId : undefined} />;
    case 'vote-results':
      return <VoteResultsTile />;
    case 'answer-browser':
      return <AnswerBrowserTile focusAnswerLabel={tile.targetId !== 'answers' ? tile.targetId : undefined} />;
    default:
      return null;
  }
}

function TileIcon({ type }: { type: TileState['type'] }) {
  const className = "w-4 h-4 text-v2-text-muted";

  switch (type) {
    case 'agent-channel':
      return (
        <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M5.5 2l-1 12M11.5 2l-1 12M2 5.5h12M2 10.5h12" strokeLinecap="round" />
        </svg>
      );
    case 'file-viewer':
      return (
        <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 2h5l3 3v9H4V2z" strokeLinejoin="round" />
          <path d="M9 2v3h3" strokeLinejoin="round" />
        </svg>
      );
    case 'workspace-browser':
      return (
        <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 4.5A1.5 1.5 0 013.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5V4.5z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'timeline-view':
      return (
        <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 3v10M6 5v6M10 4v8M14 6v4" strokeLinecap="round" />
        </svg>
      );
    case 'vote-results':
      return (
        <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 12V8M6.5 12V5M10 12V3M13.5 12V7" strokeLinecap="round" />
        </svg>
      );
    case 'answer-browser':
      return (
        <svg className={className} viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1l2.1 4.2L15 6l-3.5 3.4.8 4.8L8 12l-4.3 2.2.8-4.8L1 6l4.9-.8L8 1z" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="2" width="12" height="12" rx="2" />
        </svg>
      );
  }
}
