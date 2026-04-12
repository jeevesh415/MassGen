import { beforeEach, describe, expect, it } from 'vitest'
import { useTileStore, TileState } from './tileStore'

function makeTile(id: string): TileState {
  return { id, type: 'agent-channel', targetId: id, label: id }
}

describe('tileStore — reorderTile', () => {
  beforeEach(() => {
    useTileStore.getState().reset()
  })

  it('moves a tile from middle to front', () => {
    const tiles = [makeTile('a'), makeTile('b'), makeTile('c')]
    useTileStore.getState().setTiles(tiles)

    useTileStore.getState().reorderTile('b', 0)

    const ids = useTileStore.getState().tiles.map((t) => t.id)
    expect(ids).toEqual(['b', 'a', 'c'])
  })

  it('moves a tile from front to end', () => {
    const tiles = [makeTile('a'), makeTile('b'), makeTile('c')]
    useTileStore.getState().setTiles(tiles)

    useTileStore.getState().reorderTile('a', 2)

    const ids = useTileStore.getState().tiles.map((t) => t.id)
    expect(ids).toEqual(['b', 'c', 'a'])
  })

  it('no-ops when newIndex equals current index', () => {
    const tiles = [makeTile('a'), makeTile('b'), makeTile('c')]
    useTileStore.getState().setTiles(tiles)

    useTileStore.getState().reorderTile('b', 1)

    const ids = useTileStore.getState().tiles.map((t) => t.id)
    expect(ids).toEqual(['a', 'b', 'c'])
  })

  it('no-ops for nonexistent tileId', () => {
    const tiles = [makeTile('a'), makeTile('b')]
    useTileStore.getState().setTiles(tiles)

    useTileStore.getState().reorderTile('z', 0)

    const ids = useTileStore.getState().tiles.map((t) => t.id)
    expect(ids).toEqual(['a', 'b'])
  })

  it('preserves activeTileId after reorder', () => {
    const tiles = [makeTile('a'), makeTile('b'), makeTile('c')]
    useTileStore.getState().setTiles(tiles)
    useTileStore.getState().setActiveTile('b')

    useTileStore.getState().reorderTile('c', 0)

    expect(useTileStore.getState().activeTileId).toBe('b')
    const ids = useTileStore.getState().tiles.map((t) => t.id)
    expect(ids).toEqual(['c', 'a', 'b'])
  })
})

describe('tileStore — orientation', () => {
  beforeEach(() => {
    useTileStore.getState().reset()
  })

  it('defaults to horizontal', () => {
    expect(useTileStore.getState().orientation).toBe('horizontal')
  })

  it('toggleOrientation flips horizontal to vertical', () => {
    useTileStore.getState().toggleOrientation()
    expect(useTileStore.getState().orientation).toBe('vertical')
  })

  it('toggleOrientation flips vertical back to horizontal', () => {
    useTileStore.getState().toggleOrientation()
    useTileStore.getState().toggleOrientation()
    expect(useTileStore.getState().orientation).toBe('horizontal')
  })

  it('setOrientation sets exact value', () => {
    useTileStore.getState().setOrientation('vertical')
    expect(useTileStore.getState().orientation).toBe('vertical')
    useTileStore.getState().setOrientation('horizontal')
    expect(useTileStore.getState().orientation).toBe('horizontal')
  })
})
