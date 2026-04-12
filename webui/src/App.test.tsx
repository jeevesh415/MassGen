import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { useAgentStore } from './stores/agentStore'
import { useMessageStore } from './stores/v2/messageStore'
import { useTileStore } from './stores/v2/tileStore'

vi.mock('./hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    status: 'connected',
    startCoordination: () => undefined,
    continueConversation: () => undefined,
    cancelCoordination: () => undefined,
    broadcastMessage: () => undefined,
    error: null,
  }),
}))

vi.mock('./hooks/useWorkspaceConnection', () => ({
  useWorkspaceConnection: () => undefined,
}))

vi.mock('./hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => ({
    shortcuts: [],
  }),
}))

vi.mock('./components/v2/layout/AppShell', () => ({
  AppShell: () => <div data-testid="app-shell" />,
}))

describe('App auto-attach session replay', () => {
  beforeEach(() => {
    useAgentStore.getState().reset()
    useMessageStore.getState().reset()
    useTileStore.getState().reset()

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)

        if (url === '/api/active-session') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ session_id: 'session-live' }),
          })
        }

        if (url === '/api/sessions/session-live/events') {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              events: [
                {
                  type: 'init',
                  session_id: 'session-live',
                  agents: ['agent_a'],
                  question: 'Build it',
                  agent_models: { agent_a: 'gpt-5.4' },
                },
                {
                  type: 'structured_event',
                  session_id: 'session-live',
                  timestamp: 1,
                  sequence: 1,
                  event_type: 'text',
                  agent_id: 'agent_a',
                  round_number: 1,
                  data: {
                    content: 'Recovered history',
                  },
                },
              ],
            }),
          })
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        })
      })
    )
  })

  it('replays stored session history when it auto-attaches to an active session', async () => {
    render(<App />)

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/active-session')
    })

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/sessions/session-live/events')
    })

    await waitFor(() => {
      expect(useAgentStore.getState().sessionId).toBe('session-live')
      expect(useAgentStore.getState().question).toBe('Build it')
    })

    await waitFor(() => {
      expect(useMessageStore.getState().messages.agent_a).toEqual([
        expect.objectContaining({
          type: 'content',
          agentId: 'agent_a',
          content: 'Recovered history',
          contentType: 'text',
        }),
      ])
    })
  })
})
