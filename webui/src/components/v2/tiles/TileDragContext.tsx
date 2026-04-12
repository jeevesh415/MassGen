import { createContext, useContext } from 'react';

interface TileDragContextValue {
  tileId: string;
  isDraggable: boolean;
}

export const TileDragContext = createContext<TileDragContextValue>({
  tileId: '',
  isDraggable: false,
});

export function useTileDrag() {
  return useContext(TileDragContext);
}
