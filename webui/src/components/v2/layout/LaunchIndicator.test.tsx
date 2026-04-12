import { act } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentStore } from '../../../stores/agentStore'
import { useMessageStore } from '../../../stores/v2/messageStore'
import { LaunchIndicator } from './LaunchIndicator'

describe('LaunchIndicator activity text', () => {
  beforeEach(() => {
    useAgentStore.getState().reset()
    useMessageStore.getState().reset()
  })

  it('shows granular preparation status and detail when available', () => {
    useAgentStore.setState((state) => ({
      ...state,
      question: 'Build the thing',
      initStatus: {
        message: 'Setting up 2 agents...',
        step: 'agents',
        progress: 30,
      },
      preparationStatus: '🤖 Initializing agent_b (2/2)...',
      preparationDetail: 'Backend: codex',
    }))

    render(<LaunchIndicator configName="demo" />)

    expect(screen.getByTestId('launch-activity-label')).toHaveTextContent(
      '🤖 Initializing agent_b (2/2)...'
    )
    expect(screen.getByTestId('launch-activity-detail')).toHaveTextContent(
      'Backend: codex'
    )
    expect(screen.getByText('Setting up agents')).toBeInTheDocument()
  })

  it('switches to a thinking-focused waiting message after agents are ready but before first content', () => {
    vi.useFakeTimers()

    useAgentStore.setState((state) => ({
      ...state,
      question: 'Build the thing',
      agentOrder: ['agent_a'],
      agents: {
        agent_a: {
          id: 'agent_a',
          status: 'working',
          content: [],
          currentContent: '',
          rounds: [],
          currentRoundId: 'agent_a-round-0',
          displayRoundId: 'agent_a-round-0',
          answerCount: 0,
          voteCount: 0,
          files: [],
          toolCalls: [],
        },
      },
      initStatus: undefined,
      preparationStatus: undefined,
      preparationDetail: undefined,
    }))

    render(<LaunchIndicator configName="demo" />)

    expect(screen.getByTestId('launch-activity-label')).toHaveTextContent('Model is thinking...')
    expect(screen.getByTestId('launch-activity-detail')).toHaveTextContent(
      'The model is reading the prompt and planning its first move.'
    )

    act(() => {
      vi.advanceTimersByTime(2500)
    })

    expect(screen.getByTestId('launch-activity-detail')).not.toHaveTextContent(
      'The model is reading the prompt and planning its first move.'
    )

    vi.useRealTimers()
  })

  it('does not render skipped pending steps as invisible spacer rows', () => {
    useAgentStore.setState((state) => ({
      ...state,
      question: 'Build the thing',
      initStatus: {
        message: 'Setting up 1 agent...',
        step: 'agents',
        progress: 35,
      },
    }))

    render(<LaunchIndicator configName="demo" />)

    act(() => {
      useAgentStore.setState((state) => ({
        ...state,
        initStatus: {
          message: 'Preparing orchestrator...',
          step: 'orchestrator',
          progress: 75,
        },
      }))
    })

    act(() => {
      useAgentStore.setState((state) => ({
        ...state,
        initStatus: {
          message: 'Starting coordination...',
          step: 'starting',
          progress: 90,
        },
      }))
    })

    expect(screen.getByText('Preparing orchestrator')).toBeInTheDocument()
    expect(screen.getByText('Starting coordination')).toBeInTheDocument()
    expect(screen.queryByText('Agents initialized')).not.toBeInTheDocument()
    expect(screen.queryByText('Loading configuration')).not.toBeInTheDocument()
  })
})
