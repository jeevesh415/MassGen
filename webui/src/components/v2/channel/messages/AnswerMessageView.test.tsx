import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AnswerMessage } from '../../../../stores/v2/messageStore'
import { AnswerMessageView } from './AnswerMessageView'

describe('AnswerMessageView', () => {
  const message: AnswerMessage = {
    id: 'a1',
    type: 'answer',
    timestamp: Date.now(),
    agentId: 'agent_a',
    answerLabel: 'agent1.1',
    answerNumber: 1,
    contentPreview: 'Love is the hush between two storms, a candle cupped in careful hands, a door left open in the cold.',
    fullContent: 'Love is the hush between two storms, a candle cupped in careful hands, a door left open in the cold. It is the thread that holds the world together when everything else falls apart.',
  }

  it('shows truncated preview by default', () => {
    render(<AnswerMessageView message={message} />)
    expect(screen.getByText(/Love is the hush/)).toBeInTheDocument()
  })

  it('clicking the card expands to show full content', () => {
    render(<AnswerMessageView message={message} />)

    // Click the answer card
    fireEvent.click(screen.getByTestId('answer-card'))

    // Should show expanded state
    expect(screen.getByTestId('answer-expanded')).toBeInTheDocument()
  })

  it('clicking expanded card collapses it', () => {
    render(<AnswerMessageView message={message} />)

    // Open
    fireEvent.click(screen.getByTestId('answer-card'))
    expect(screen.getByTestId('answer-expanded')).toBeInTheDocument()

    // Close
    fireEvent.click(screen.getByTestId('answer-card'))
    expect(screen.queryByTestId('answer-expanded')).toBeNull()
  })
})
