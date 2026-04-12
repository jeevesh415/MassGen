import { useState, useCallback } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { cn } from '../../../lib/utils';
import { useTileStore, TileState } from '../../../stores/v2/tileStore';
import { useWizardStore } from '../../../stores/wizardStore';
import { TileWrapper } from './TileWrapper';
import { EmptyState } from './EmptyState';
import { OrientationToggle } from './OrientationToggle';

interface TileContainerProps {
  hasConfigs?: boolean;
}

export function TileContainer({ hasConfigs }: TileContainerProps) {
  const tiles = useTileStore((s) => s.tiles);
  const activeTileId = useTileStore((s) => s.activeTileId);
  const setActiveTile = useTileStore((s) => s.setActiveTile);
  const orientation = useTileStore((s) => s.orientation);
  const reorderTile = useTileStore((s) => s.reorderTile);
  const openWizard = useWizardStore((s) => s.openWizard);

  const [dragTileId, setDragTileId] = useState<string | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((tileId: string) => {
    setDragTileId(tileId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragTileId(null);
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const isHorizontal = orientation === 'horizontal';
      const pos = isHorizontal ? e.clientX - rect.left : e.clientY - rect.top;
      const size = isHorizontal ? rect.width : rect.height;
      const insertIndex = pos < size / 2 ? index : index + 1;
      setDropTargetIndex(insertIndex);
    },
    [orientation]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const tileId = e.dataTransfer.getData('text/plain');
      if (tileId && dropTargetIndex !== null) {
        // Adjust index: if dragging forward, the splice-remove shifts indices
        const oldIndex = tiles.findIndex((t) => t.id === tileId);
        let targetIndex = dropTargetIndex;
        if (oldIndex !== -1 && oldIndex < targetIndex) {
          targetIndex = Math.max(0, targetIndex - 1);
        }
        reorderTile(tileId, targetIndex);
      }
      setDragTileId(null);
      setDropTargetIndex(null);
    },
    [dropTargetIndex, tiles, reorderTile]
  );

  if (tiles.length === 0) {
    return <EmptyState onOpenWizard={openWizard} hasConfigs={hasConfigs} />;
  }

  if (tiles.length === 1) {
    return (
      <div className="h-full animate-v2-tile-enter">
        <TileWrapper tile={tiles[0]} isActive showClose={false} />
      </div>
    );
  }

  // Multiple tiles: render in a resizable panel group
  return (
    <div className="h-full relative">
      <OrientationToggle />
      <Group
        orientation={orientation}
        className="h-full animate-v2-tile-enter"
        key={tiles.map((t) => t.id).join(',')}
      >
        {tiles.map((tile, index) => (
          <TilePanel
            key={tile.id}
            tile={tile}
            index={index}
            total={tiles.length}
            isActive={tile.id === activeTileId}
            isDragging={tile.id === dragTileId}
            dropIndicatorPos={
              dropTargetIndex === index
                ? 'before'
                : dropTargetIndex === index + 1
                  ? 'after'
                  : null
            }
            orientation={orientation}
            onFocus={() => setActiveTile(tile.id)}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        ))}
      </Group>
    </div>
  );
}

interface TilePanelProps {
  tile: TileState;
  index: number;
  total: number;
  isActive: boolean;
  isDragging: boolean;
  dropIndicatorPos: 'before' | 'after' | null;
  orientation: 'horizontal' | 'vertical';
  onFocus: () => void;
  onDragStart: (tileId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent) => void;
}

function TilePanel({
  tile,
  index,
  total,
  isActive,
  isDragging,
  dropIndicatorPos,
  orientation,
  onFocus,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: TilePanelProps) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <>
      {index > 0 && (
        <Separator
          className={cn(
            'transition-colors duration-150',
            isHorizontal
              ? 'w-[2px] bg-v2-border hover:bg-v2-accent'
              : 'h-[2px] bg-v2-border hover:bg-v2-accent'
          )}
        />
      )}
      <Panel
        id={tile.id}
        minSize={total >= 4 ? 15 : total >= 3 ? 18 : 20}
        defaultSize={100 / total}
      >
        <div
          className={cn('h-full relative', isDragging && 'opacity-50')}
          onClick={onFocus}
          onDragOver={(e) => onDragOver(e, index)}
          onDrop={onDrop}
        >
          {/* Drop indicator — before */}
          {dropIndicatorPos === 'before' && (
            <div
              className={cn(
                'absolute z-20 bg-v2-accent',
                isHorizontal ? 'left-0 top-0 bottom-0 w-[2px]' : 'top-0 left-0 right-0 h-[2px]'
              )}
            />
          )}

          <TileWrapper
            tile={tile}
            isActive={isActive}
            showClose={total > 1}
            onDragStart={() => onDragStart(tile.id)}
            onDragEnd={onDragEnd}
          />

          {/* Drop indicator — after */}
          {dropIndicatorPos === 'after' && (
            <div
              className={cn(
                'absolute z-20 bg-v2-accent',
                isHorizontal ? 'right-0 top-0 bottom-0 w-[2px]' : 'bottom-0 left-0 right-0 h-[2px]'
              )}
            />
          )}
        </div>
      </Panel>
    </>
  );
}
