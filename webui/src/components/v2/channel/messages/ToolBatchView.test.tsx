import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ToolCallMessage } from '../../../../stores/v2/messageStore'
import { ToolBatchView } from './ToolBatchView'

function makeTool(id: string, name: string): ToolCallMessage {
  return {
    id,
    type: 'tool-call',
    timestamp: Date.now(),
    agentId: 'agent_a',
    toolName: name,
    args: { command: `do ${id}` },
    result: 'ok',
    success: true,
  }
}

describe('ToolBatchView', () => {
  it('shows only last 3 tools by default with earlier count', () => {
    const tools = Array.from({ length: 6 }, (_, i) => makeTool(`t${i}`, 'codex_shell'))
    render(<ToolBatchView tools={tools} />)

    // Should show "(+3 earlier)" indicator
    expect(screen.getByText('(+3 earlier)')).toBeInTheDocument()
  })

  it('clicking header collapses all tool lines (fully hidden)', () => {
    const tools = [makeTool('t1', 'shell'), makeTool('t2', 'shell')]
    render(<ToolBatchView tools={tools} />)

    // Tool tree visible initially
    expect(screen.getByTestId('batch-tool-tree')).toBeInTheDocument()

    // Click the batch header to collapse
    const header = screen.getByTestId('batch-header')
    fireEvent.click(header)

    // Tool tree should be hidden
    expect(screen.queryByTestId('batch-tool-tree')).toBeNull()
  })

  it('clicking collapsed header re-expands tool lines', () => {
    const tools = [makeTool('t1', 'shell'), makeTool('t2', 'shell')]
    render(<ToolBatchView tools={tools} />)

    const header = screen.getByTestId('batch-header')

    // Collapse
    fireEvent.click(header)
    expect(screen.queryByTestId('batch-tool-tree')).toBeNull()

    // Re-expand
    fireEvent.click(header)
    expect(screen.getByTestId('batch-tool-tree')).toBeInTheDocument()
  })
})
