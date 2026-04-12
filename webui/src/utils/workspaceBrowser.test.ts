import { describe, expect, it } from 'vitest'
import {
  getAgentWorkspaceLabel,
  getWorkspaceVersionOptions,
} from './workspaceBrowser'

describe('workspaceBrowser helpers', () => {
  it('formats agent labels and version options for human-readable workspace history', () => {
    expect(getAgentWorkspaceLabel('agent_b', ['agent_a', 'agent_b'])).toBe('Agent 2')

    expect(
      getWorkspaceVersionOptions({
        agentId: 'agent_b',
        liveWorkspacePath: '/tmp/workspace2',
        answers: [
          {
            id: 'answer-b-1',
            agentId: 'agent_b',
            answerNumber: 1,
            content: 'First answer',
            timestamp: 1700000000000,
            votes: 0,
            workspacePath: '/tmp/logs/agent_b/20260101/workspace',
          },
          {
            id: 'answer-b-2',
            agentId: 'agent_b',
            answerNumber: 2,
            content: 'Second answer',
            timestamp: 1700000600000,
            votes: 0,
            workspacePath: '/tmp/logs/agent_b/20260102/workspace',
          },
        ],
      })
    ).toEqual([
      {
        value: '/tmp/workspace2',
        label: 'Live',
        kind: 'live',
      },
      {
        value: '/tmp/logs/agent_b/20260102/workspace',
        label: 'Answer 2',
        kind: 'historical',
      },
      {
        value: '/tmp/logs/agent_b/20260101/workspace',
        label: 'Answer 1',
        kind: 'historical',
      },
    ])
  })
})
