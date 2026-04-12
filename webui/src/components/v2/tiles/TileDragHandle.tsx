import { cn } from '../../../lib/utils';
import { useTileDrag } from './TileDragContext';

export function TileDragHandle() {
  const { tileId, isDraggable } = useTileDrag();

  if (!isDraggable) return null;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', tileId);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={cn(
        'flex flex-col items-center justify-center gap-[3px] w-4 h-4 cursor-grab shrink-0',
        'text-v2-text-muted hover:text-v2-text',
        'active:cursor-grabbing'
      )}
      title="Drag to reorder"
    >
      {/* 3 rows x 2 dots grip icon */}
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-[3px]">
          <div className="w-[3px] h-[3px] rounded-full bg-current" />
          <div className="w-[3px] h-[3px] rounded-full bg-current" />
        </div>
      ))}
    </div>
  );
}
