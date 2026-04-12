import { useEffect } from 'react';
import { useAgentStore } from '../stores/agentStore';
import { useTileStore } from '../stores/v2/tileStore';

export function useV2KeyboardShortcuts() {
  const agentOrder = useAgentStore((s) => s.agentOrder);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      // Ctrl/Cmd + 1-9: Switch to agent channel by index
      if (isMod && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (index < agentOrder.length) {
          const agentId = agentOrder[index];
          const agents = useAgentStore.getState().agents;
          useTileStore.getState().setTile({
            id: `channel-${agentId}`,
            type: 'agent-channel',
            targetId: agentId,
            label: agents[agentId]?.modelName || agentId,
          });
        }
      }

      // Ctrl/Cmd + \: Toggle autofit (split view)
      if (isMod && e.key === '\\') {
        e.preventDefault();
        const store = useTileStore.getState();
        if (store.autofit) {
          // Back to single
          if (agentOrder.length > 0) {
            const agents = useAgentStore.getState().agents;
            store.setTile({
              id: `channel-${agentOrder[0]}`,
              type: 'agent-channel',
              targetId: agentOrder[0],
              label: agents[agentOrder[0]]?.modelName || agentOrder[0],
            });
          }
        } else {
          // Autofit all
          const allTiles = agentOrder.map((id) => ({
            id: `channel-${id}`,
            type: 'agent-channel' as const,
            targetId: id,
            label: id,
          }));
          store.setAutofitTiles(allTiles);
        }
      }

      // Ctrl/Cmd+Shift+Left/Right: move active tile
      if (isMod && e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const store = useTileStore.getState();
        const { tiles, activeTileId } = store;
        if (!activeTileId || tiles.length < 2) return;
        const currentIndex = tiles.findIndex((t) => t.id === activeTileId);
        if (currentIndex === -1) return;
        const newIndex = e.key === 'ArrowLeft'
          ? Math.max(0, currentIndex - 1)
          : Math.min(tiles.length - 1, currentIndex + 1);
        if (newIndex !== currentIndex) {
          store.reorderTile(activeTileId, newIndex);
        }
      }

      // Ctrl/Cmd+Shift+O: toggle orientation
      if (isMod && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
        e.preventDefault();
        useTileStore.getState().toggleOrientation();
      }

      // Escape: Close secondary tiles (go back to single)
      if (e.key === 'Escape') {
        const store = useTileStore.getState();
        if (store.tiles.length > 1) {
          e.preventDefault();
          const firstTile = store.tiles[0];
          store.setTile(firstTile);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [agentOrder]);
}
