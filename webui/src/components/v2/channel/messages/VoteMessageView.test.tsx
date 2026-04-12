import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { VoteMessage } from '../../../../stores/v2/messageStore'
import { VoteMessageView } from './VoteMessageView'

describe('VoteMessageView', () => {
  const message: VoteMessage = {
    id: 'v1',
    type: 'vote',
    timestamp: Date.now(),
    agentId: 'agent_a',
    targetId: 'agent_a',
    targetName: 'agent_a (gpt-5.4)',
    reason: 'agent1 directly answers the original request with a polished, evocative love poem. It is concise, emotionally resonant, and no iteration is needed.',
    voteLabel: 'vote1.1',
    voteRound: 1,
  }

  it('shows vote target and truncated reason by default', () => {
    render(<VoteMessageView message={message} />)
    expect(screen.getByText(/Voted for/)).toBeInTheDocument()
    expect(screen.getByText(/agent1 directly answers/)).toBeInTheDocument()
  })

  it('clicking the card expands to show full reason', () => {
    render(<VoteMessageView message={message} />)

    fireEvent.click(screen.getByTestId('vote-card'))
    expect(screen.getByTestId('vote-expanded')).toBeInTheDocument()
  })

  it('clicking expanded card collapses it', () => {
    render(<VoteMessageView message={message} />)

    // Open
    fireEvent.click(screen.getByTestId('vote-card'))
    expect(screen.getByTestId('vote-expanded')).toBeInTheDocument()

    // Close
    fireEvent.click(screen.getByTestId('vote-card'))
    expect(screen.queryByTestId('vote-expanded')).toBeNull()
  })
})
