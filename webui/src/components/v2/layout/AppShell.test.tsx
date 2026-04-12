import { act } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentStore } from '../../../stores/agentStore'
import { useMessageStore } from '../../../stores/v2/messageStore'
import { useTileStore } from '../../../stores/v2/tileStore'
import { AppShell } from './AppShell'

vi.mock('../../../hooks/useV2KeyboardShortcuts', () => ({
  useV2KeyboardShortcuts: () => undefined,
}))

vi.mock('../sidebar/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}))

vi.mock('./GlobalInputBar', () => ({
  GlobalInputBar: () => <div data-testid="global-input-bar" />,
}))

vi.mock('./LaunchIndicator', () => ({
  LaunchIndicator: () => <div data-testid="launch-indicator">launch</div>,
}))

vi.mock('../tiles/TileContainer', () => ({
  TileContainer: () => <div data-testid="tile-container">tiles</div>,
}))

describe('AppShell launch transition', () => {
  beforeEach(() => {
    useAgentStore.getState().reset()
    useMessageStore.getState().reset()
    useTileStore.getState().reset()

    act(() => {
      useAgentStore.getState().initSession('session-1', 'Build the thing', [], 'dark')
    })
  })

  it('keeps launch visible until the first meaningful agent activity arrives', () => {
    render(
      <AppShell
        wsStatus="connected"
        startCoordination={() => undefined}
        continueConversation={() => undefined}
        cancelCoordination={() => undefined}
        selectedConfig="configs/basic/demo.yaml"
        onConfigChange={() => undefined}
      />
    )

    expect(screen.getByTestId('launch-indicator')).toBeInTheDocument()
    expect(screen.getByTestId('tile-container')).toBeInTheDocument()
    expect(screen.getByTestId('launch-layer')).toHaveClass('opacity-100')
    expect(screen.getByTestId('tiles-layer')).toHaveClass('opacity-0')

    act(() => {
      useAgentStore.setState((state) => ({
        ...state,
        agentOrder: ['agent_a'],
        agents: {
          agent_a: {
            modelName: 'gpt-5.4',
          } as never,
        },
      }))
    })

    expect(screen.getByTestId('launch-indicator')).toBeInTheDocument()
    expect(screen.getByTestId('tile-container')).toBeInTheDocument()
    expect(screen.getByTestId('launch-layer')).toHaveClass('opacity-100')
    expect(screen.getByTestId('tiles-layer')).toHaveClass('opacity-0')

    act(() => {
      useMessageStore.setState((state) => ({
        ...state,
        messages: {
          agent_a: [
            {
              id: 'msg-1',
              type: 'content',
              agentId: 'agent_a',
              timestamp: 1,
              content: 'hello',
              contentType: 'text',
            },
          ],
        },
      }))
    })

    expect(screen.getByTestId('launch-indicator')).toBeInTheDocument()
    expect(screen.getByTestId('tile-container')).toBeInTheDocument()
    expect(screen.getByTestId('launch-layer')).toHaveClass('opacity-0')
    expect(screen.getByTestId('tiles-layer')).toHaveClass('opacity-100')
  })
})
