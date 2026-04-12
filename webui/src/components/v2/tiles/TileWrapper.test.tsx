import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TileState, useTileStore } from '../../../stores/v2/tileStore'
import { TileWrapper } from './TileWrapper'

vi.mock('../channel/AgentChannel', () => ({
  AgentChannel: ({ agentId }: { agentId: string }) => (
    <div data-testid="agent-channel">{agentId}</div>
  ),
}))

vi.mock('./FileViewerTile', () => ({
  FileViewerTile: ({
    filePath,
    workspacePath,
  }: {
    filePath: string
    workspacePath?: string
  }) => (
    <div data-testid="file-viewer-props">
      {filePath}::{workspacePath ?? 'missing'}
    </div>
  ),
}))

vi.mock('./WorkspaceBrowserTile', () => ({
  WorkspaceBrowserTile: ({
    initialWorkspacePath,
  }: {
    initialWorkspacePath?: string
  }) => (
    <div data-testid="workspace-browser-props">
      {initialWorkspacePath ?? 'missing'}
    </div>
  ),
}))

vi.mock('./TimelineTile', () => ({
  TimelineTile: () => <div>Timeline</div>,
}))

vi.mock('./VoteResultsTile', () => ({
  VoteResultsTile: () => <div>VoteResults</div>,
}))

vi.mock('./AnswerBrowserTile', () => ({
  AnswerBrowserTile: () => <div>AnswerBrowser</div>,
}))

vi.mock('./SubagentTile', () => ({
  SubagentTile: () => <div>Subagent</div>,
}))

vi.mock('../../InlineArtifactPreview', () => ({
  InlineArtifactPreview: ({
    filePath,
    workspacePath,
  }: {
    filePath: string
    workspacePath: string
  }) => (
    <div data-testid="artifact-preview-props">
      {filePath}::{workspacePath}
    </div>
  ),
}))

describe('TileWrapper', () => {
  beforeEach(() => {
    useTileStore.getState().reset()
  })

  it('passes workspace context to file viewer tiles', () => {
    const tile = {
      id: 'file-report',
      type: 'file-viewer',
      targetId: 'report.md',
      label: 'Report',
      workspacePath: '/tmp/logs/agent_b/20260102/workspace',
    } as TileState

    render(
      <TileWrapper
        tile={tile}
        isActive
        showClose={false}
      />
    )

    expect(screen.getByTestId('file-viewer-props')).toHaveTextContent(
      'report.md::/tmp/logs/agent_b/20260102/workspace'
    )
  })

  it('passes the requested workspace path into workspace browser tiles', () => {
    const tile = {
      id: 'workspace-answer',
      type: 'workspace-browser',
      targetId: '/tmp/logs/agent_b/20260102/workspace',
      label: 'Files · Answer 2',
    } as TileState

    render(
      <TileWrapper
        tile={tile}
        isActive
        showClose={false}
      />
    )

    expect(screen.getByTestId('workspace-browser-props')).toHaveTextContent(
      '/tmp/logs/agent_b/20260102/workspace'
    )
  })
})
