import { act } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentStore } from '../../../stores/agentStore'
import { useTileStore } from '../../../stores/v2/tileStore'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { WorkspaceBrowserTile } from './WorkspaceBrowserTile'

vi.mock('react-resizable-panels', () => ({
  Group: ({
    orientation,
    className,
    children,
  }: {
    orientation: 'horizontal' | 'vertical'
    className?: string
    children: React.ReactNode
  }) => (
    <div data-testid="panel-group" data-orientation={orientation} className={className}>
      {children}
    </div>
  ),
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: ({ className }: { className?: string }) => (
    <div data-testid="panel-separator" className={className} />
  ),
}))

vi.mock('../../InlineArtifactPreview', () => ({
  InlineArtifactPreview: ({ filePath }: { filePath: string }) => (
    <div data-testid="inline-artifact-preview">{filePath}</div>
  ),
}))

describe('WorkspaceBrowserTile', () => {
  beforeEach(() => {
    useAgentStore.getState().reset()
    useTileStore.getState().reset()
    useWorkspaceStore.getState().reset()

    act(() => {
      useAgentStore.getState().initSession('session-1', 'Inspect files', ['agent_a'], 'dark')
      useWorkspaceStore.getState().setInitialFiles('/tmp/workspace', [
        {
          path: 'tasks/plan.json',
          size: 5300,
          modified: 1,
        },
        {
          path: 'deliverables/index.html',
          size: 2400,
          modified: 2,
        },
      ])
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          files: [
            {
              path: 'historical/report.md',
              size: 128,
              modified: 10,
            },
          ],
          workspace_path: '/tmp/logs/agent_b/20260102/workspace',
        }),
      }))
    )
  })

  it('auto-previews the main artifact and marks previewable files in the tree', () => {
    render(<WorkspaceBrowserTile />)

    expect(screen.getByTestId('inline-artifact-preview')).toHaveTextContent('deliverables/index.html')
    expect(screen.getAllByLabelText('Rich preview available')).toHaveLength(1)
  })

  it('shows side-by-side tree and preview after selecting a file', () => {
    render(<WorkspaceBrowserTile />)

    fireEvent.click(screen.getByText('plan.json'))

    expect(screen.getByTestId('inline-artifact-preview')).toHaveTextContent('tasks/plan.json')
    expect(screen.getByTestId('panel-group')).toHaveAttribute('data-orientation', 'horizontal')
  })

  it('stores the active workspace path when opening a file in a new tile', () => {
    render(<WorkspaceBrowserTile />)

    fireEvent.click(screen.getByTitle('Open in new tile'))

    expect(useTileStore.getState().tiles).toContainEqual(
      expect.objectContaining({
        type: 'file-viewer',
        targetId: 'deliverables/index.html',
        workspacePath: '/tmp/workspace',
      })
    )
  })

  it('shows an agent-level version selector with human-readable history labels', () => {
    act(() => {
      useAgentStore.getState().reset()
      useWorkspaceStore.getState().reset()
      useTileStore.getState().reset()

      useAgentStore.getState().initSession(
        'session-2',
        'Inspect history',
        ['agent_a', 'agent_b'],
        'dark'
      )
      useWorkspaceStore.getState().setInitialFiles('/tmp/workspace1', [
        {
          path: 'deliverables/agent-a.html',
          size: 1100,
          modified: 1,
        },
      ])
      useWorkspaceStore.getState().setInitialFiles('/tmp/workspace2', [
        {
          path: 'deliverables/agent-b.html',
          size: 1200,
          modified: 2,
        },
      ])
      useAgentStore.getState().addAnswer({
        id: 'answer-b-1',
        agentId: 'agent_b',
        answerNumber: 1,
        content: 'Answer one',
        timestamp: 1700000000000,
        votes: 0,
        workspacePath: '/tmp/logs/agent_b/20260101/workspace',
      })
      useAgentStore.getState().addAnswer({
        id: 'answer-b-2',
        agentId: 'agent_b',
        answerNumber: 2,
        content: 'Answer two',
        timestamp: 1700000600000,
        votes: 0,
        workspacePath: '/tmp/logs/agent_b/20260102/workspace',
      })
    })

    render(
      <WorkspaceBrowserTile initialWorkspacePath="/tmp/logs/agent_b/20260102/workspace" />
    )

    expect(screen.getByText('Agent 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Version')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Live' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Answer 2' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Answer 1' })).toBeInTheDocument()
  })

  it('maps hashed live workspace paths to the correct agents when metadata is present', () => {
    act(() => {
      useAgentStore.getState().reset()
      useWorkspaceStore.getState().reset()
      useTileStore.getState().reset()

      useAgentStore.getState().initSession(
        'session-3',
        'Inspect hashed live workspaces',
        ['agent_a', 'agent_b'],
        'dark'
      )

      useWorkspaceStore.setState({
        workspaces: {
          '/tmp/workspace_674c6c33': {
            workspacePath: '/tmp/workspace_674c6c33',
            files: [
              {
                path: 'deliverables/agent-a.html',
                size: 1100,
                modified: 1,
              },
            ],
            lastUpdated: 1,
            agentId: 'agent_a',
          },
          '/tmp/workspace_2ee260e0': {
            workspacePath: '/tmp/workspace_2ee260e0',
            files: [
              {
                path: 'deliverables/agent-b.html',
                size: 1200,
                modified: 2,
              },
            ],
            lastUpdated: 2,
            agentId: 'agent_b',
          },
        },
      } as never)
    })

    render(<WorkspaceBrowserTile />)

    expect(screen.queryByText('Waiting for workspace data...')).not.toBeInTheDocument()
    expect(screen.getByText('Agent 1')).toBeInTheDocument()
    expect(screen.getByText('Agent 2')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Live' })).toBeInTheDocument()
  })
})
