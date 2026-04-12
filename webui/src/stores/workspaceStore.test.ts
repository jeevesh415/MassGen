import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspaceStore'

describe('workspaceStore historical snapshots', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset()
  })

  afterEach(() => {
    useWorkspaceStore.getState().reset()
  })

  it('treats an empty fetched historical snapshot as loaded instead of pending', () => {
    useWorkspaceStore.getState().addHistoricalSnapshot(
      'agent2.1',
      '/tmp/logs/agent_b/20260101/workspace'
    )

    expect(useWorkspaceStore.getState().getHistoricalFiles('agent2.1')).toBeNull()

    useWorkspaceStore.getState().setSnapshotFiles('agent2.1', [])

    expect(useWorkspaceStore.getState().getHistoricalFiles('agent2.1')).toEqual([])
  })
})
