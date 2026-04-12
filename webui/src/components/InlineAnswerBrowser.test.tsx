import { act } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentStore } from '../stores/agentStore'
import { InlineAnswerBrowser } from './InlineAnswerBrowser'

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}))

describe('InlineAnswerBrowser workspace history labels', () => {
  beforeEach(() => {
    useAgentStore.getState().reset()

    act(() => {
      useAgentStore.getState().initSession(
        'session-history',
        'Inspect workspace history',
        ['agent_a', 'agent_b'],
        'dark'
      )
      useAgentStore.setState({ selectedAgent: 'agent_a' })
      useAgentStore.getState().addAnswer({
        id: 'answer-b-1',
        agentId: 'agent_b',
        answerNumber: 1,
        content: 'First answer',
        timestamp: 1700000000000,
        votes: 0,
        workspacePath: '/tmp/logs/agent_b/20260101/workspace',
      })
      useAgentStore.getState().addAnswer({
        id: 'answer-b-2',
        agentId: 'agent_b',
        answerNumber: 2,
        content: 'Second answer',
        timestamp: 1700000600000,
        votes: 0,
        workspacePath: '/tmp/logs/agent_b/20260102/workspace',
      })
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.startsWith('/api/workspaces')) {
          return {
            ok: true,
            json: async () => ({
              current: [
                {
                  name: 'workspace1',
                  path: '/tmp/workspace1',
                  type: 'current',
                  agentId: 'agent_a',
                },
                {
                  name: 'workspace2',
                  path: '/tmp/workspace2',
                  type: 'current',
                  agentId: 'agent_b',
                },
              ],
              historical: [],
            }),
          }
        }

        if (url.startsWith('/api/sessions/session-history/answer-workspaces')) {
          return {
            ok: true,
            json: async () => ({
              workspaces: [
                {
                  answerId: 'answer-b-1',
                  agentId: 'agent_b',
                  answerNumber: 1,
                  answerLabel: 'agent2.1',
                  timestamp: '2026-01-01T00:00:00Z',
                  workspacePath: '/tmp/logs/agent_b/20260101/workspace',
                },
                {
                  answerId: 'answer-b-2',
                  agentId: 'agent_b',
                  answerNumber: 2,
                  answerLabel: 'agent2.2',
                  timestamp: '2026-01-02T00:00:00Z',
                  workspacePath: '/tmp/logs/agent_b/20260102/workspace',
                },
              ],
              current: [],
            }),
          }
        }

        if (url.startsWith('/api/workspace/browse')) {
          return {
            ok: true,
            json: async () => ({
              files: [
                {
                  path: 'deliverables/index.html',
                  size: 1200,
                  modified: 1,
                },
              ],
            }),
          }
        }

        throw new Error(`Unexpected fetch request: ${url}`)
      })
    )
  })

  it('shows agent-level workspace buttons and human-readable version names', async () => {
    render(<InlineAnswerBrowser />)

    fireEvent.click(screen.getByRole('button', { name: /Workspace/ }))

    await screen.findByRole('button', { name: 'Agent 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Agent 2' }))

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Live' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Answer 2' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Answer 1' })).toBeInTheDocument()
    })
  })
})
