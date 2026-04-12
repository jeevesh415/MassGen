import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { clearFileCache, useFileContent } from './useFileContent'

describe('useFileContent', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset()
    clearFileCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useWorkspaceStore.getState().reset()
    clearFileCache()
  })

  it('does not keep a sticky not-found cache for live workspaces after a refresh-triggering 404', async () => {
    const refreshSession = vi.fn()

    useWorkspaceStore.getState().setInitialFiles('/tmp/workspace1', [
      {
        path: 'deliverables/index.html',
        size: 1200,
        modified: 1,
      },
    ])
    useWorkspaceStore.getState().setRefreshSessionFn(refreshSession)

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'File not found' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: '<html>Recovered</html>',
          binary: false,
          size: 22,
          mimeType: 'text/html',
          language: 'html',
        }),
      })

    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useFileContent())

    await act(async () => {
      await result.current.fetchFile('deliverables/index.html', '/tmp/workspace1')
    })

    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBe('File not found')

    await act(async () => {
      await result.current.fetchFile('deliverables/index.html', '/tmp/workspace1')
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.content).toEqual(
      expect.objectContaining({
        content: '<html>Recovered</html>',
        binary: false,
      })
    )
    expect(result.current.error).toBeNull()
  })
})
