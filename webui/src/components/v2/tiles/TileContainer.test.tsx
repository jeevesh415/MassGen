import { act } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentStore } from '../../../stores/agentStore'
import { useTileStore, TileState } from '../../../stores/v2/tileStore'
import { TileContainer } from './TileContainer'

vi.mock('react-resizable-panels', () => ({
  Group: ({
    orientation,
    className,
    children,
  }: {
    orientation: 'horizontal' | 'vertical'
    className?: string
    children: React.ReactNode
  }) => (
    <div data-testid="panel-group" data-orientation={orientation} className={className}>
      {children}
    </div>
  ),
  Panel: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <div data-testid={`panel-${id}`}>{children}</div>
  ),
  Separator: ({ className }: { className?: string }) => (
    <div data-testid="panel-separator" className={className} />
  ),
}))

// Mock all tile content components to avoid deep dependency chains
vi.mock('../channel/AgentChannel', () => ({
  AgentChannel: ({ agentId }: { agentId: string }) => (
    <div data-testid={`agent-channel-${agentId}`}>Agent: {agentId}</div>
  ),
}))

vi.mock('./FileViewerTile', () => ({
  FileViewerTile: () => <div>FileViewer</div>,
}))

vi.mock('./WorkspaceBrowserTile', () => ({
  WorkspaceBrowserTile: () => <div>WorkspaceBrowser</div>,
}))

vi.mock('./TimelineTile', () => ({
  TimelineTile: () => <div>Timeline</div>,
}))

vi.mock('./VoteResultsTile', () => ({
  VoteResultsTile: () => <div>VoteResults</div>,
}))

vi.mock('./SubagentTile', () => ({
  SubagentTile: () => <div>Subagent</div>,
}))

vi.mock('../../InlineArtifactPreview', () => ({
  InlineArtifactPreview: () => <div>ArtifactPreview</div>,
}))

function makeTile(id: string): TileState {
  return { id, type: 'agent-channel', targetId: id, label: id }
}

describe('TileContainer', () => {
  beforeEach(() => {
    useTileStore.getState().reset()
    useAgentStore.getState().reset()
  })

  it('renders Group with orientation from store', () => {
    act(() => {
      useTileStore.getState().setTiles([makeTile('a'), makeTile('b')])
    })

    const { rerender } = render(<TileContainer />)
    expect(screen.getByTestId('panel-group')).toHaveAttribute('data-orientation', 'horizontal')

    act(() => {
      useTileStore.getState().setOrientation('vertical')
    })

    rerender(<TileContainer />)
    expect(screen.getByTestId('panel-group')).toHaveAttribute('data-orientation', 'vertical')
  })

  it('shows OrientationToggle only when 2+ tiles', () => {
    // Single tile — no toggle
    act(() => {
      useTileStore.getState().setTiles([makeTile('a')])
    })
    const { rerender } = render(<TileContainer />)
    expect(screen.queryByTitle('Toggle layout orientation')).toBeNull()

    // Two tiles — toggle visible
    act(() => {
      useTileStore.getState().setTiles([makeTile('a'), makeTile('b')])
    })
    rerender(<TileContainer />)
    expect(screen.getByTitle('Toggle layout orientation')).toBeInTheDocument()
  })

  it('OrientationToggle click calls toggleOrientation', () => {
    act(() => {
      useTileStore.getState().setTiles([makeTile('a'), makeTile('b')])
    })

    render(<TileContainer />)
    expect(useTileStore.getState().orientation).toBe('horizontal')

    fireEvent.click(screen.getByTitle('Toggle layout orientation'))
    expect(useTileStore.getState().orientation).toBe('vertical')
  })

  it('renders empty state when no tiles', () => {
    render(<TileContainer />)
    // EmptyState renders when tiles.length === 0
    expect(screen.queryByTestId('panel-group')).toBeNull()
  })

  it('does not render prompt banner (removed)', () => {
    act(() => {
      useAgentStore.getState().initSession('s1', 'Write a poem about cats', ['agent_a'], 'dark')
      useTileStore.getState().setTiles([makeTile('a')])
    })

    render(<TileContainer />)
    expect(screen.queryByTestId('prompt-banner')).toBeNull()
  })
})
