import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { WSEvent } from '../../../types'
import { useMessageStore } from '../../../stores/v2/messageStore'
import { ModeBar } from './ModeBar'

describe('ModeBar', () => {
  beforeEach(() => {
    useMessageStore.getState().reset()
  })

  it('renders the restored coordination phase from a state snapshot', () => {
    useMessageStore.getState().processWSEvent({
      type: 'state_snapshot',
      session_id: 'session-1',
      timestamp: 1,
      sequence: 1,
      agents: ['agent_a'],
      question: 'Resume the run',
      current_phase: 'coordinating',
    } as unknown as WSEvent)

    render(<ModeBar />)

    expect(screen.getByText('Coordinating')).toBeInTheDocument()
  })
})
