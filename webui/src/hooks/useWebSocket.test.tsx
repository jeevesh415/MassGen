import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentStore } from '../stores/agentStore'
import { useMessageStore } from '../stores/v2/messageStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useWebSocket } from './useWebSocket'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  url: string
  readyState = MockWebSocket.CONNECTING
  sent: string[] = []
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close(code = 1000, reason = 'Client disconnect') {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code, reason } as CloseEvent)
  }

  open() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent)
  }
}

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    useAgentStore.getState().reset()
    useMessageStore.getState().reset()
    useWorkspaceStore.getState().reset()

    act(() => {
      useAgentStore.getState().initSession('session-1', 'Build it', ['agent_a'], 'dark')
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    useAgentStore.getState().reset()
    useMessageStore.getState().reset()
    useWorkspaceStore.getState().reset()
  })

  it('debounces workspace refreshes after live file_change events', () => {
    const refreshSession = vi.fn()
    useWorkspaceStore.getState().setRefreshSessionFn(refreshSession)

    const { unmount } = renderHook(() =>
      useWebSocket({
        sessionId: 'session-1',
      })
    )

    const socket = MockWebSocket.instances[0]
    expect(socket).toBeDefined()

    act(() => {
      socket.open()
      socket.receive({
        type: 'file_change',
        session_id: 'session-1',
        timestamp: 1,
        sequence: 1,
        agent_id: 'agent_a',
        path: 'deliverables/index.html',
        operation: 'create',
      })
      socket.receive({
        type: 'file_change',
        session_id: 'session-1',
        timestamp: 2,
        sequence: 2,
        agent_id: 'agent_a',
        path: 'deliverables/index.html',
        operation: 'modify',
      })
    })

    expect(refreshSession).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(250)
    })

    expect(refreshSession).toHaveBeenCalledTimes(1)

    unmount()
  })
})
