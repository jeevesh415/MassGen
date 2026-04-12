import type { WSEvent } from '../../types'
import { beforeEach, describe, expect, it } from 'vitest'
import { useMessageStore } from './messageStore'

describe('useMessageStore round dividers', () => {
  beforeEach(() => {
    useMessageStore.getState().reset()
  })

  it('maps zero-based round_start values to visible Round numbers and ignores restart banners', () => {
    const store = useMessageStore.getState()

    store.processWSEvent({
      type: 'init',
      session_id: 'session-1',
      timestamp: 1,
      sequence: 1,
      question: 'Ship it',
      agents: ['agent_a'],
      theme: 'dark',
    })

    expect(useMessageStore.getState().messages.agent_a).toEqual([])
    expect(useMessageStore.getState().currentRound.agent_a).toBe(0)

    store.processWSEvent({
      type: 'structured_event',
      session_id: 'session-1',
      timestamp: 2,
      sequence: 2,
      event_type: 'round_start',
      agent_id: 'agent_a',
      round_number: 0,
      data: {},
    } as unknown as WSEvent)

    expect(
      useMessageStore.getState().messages.agent_a.map((message) =>
        message.type === 'round-divider' ? message.roundNumber : null
      )
    ).toEqual([1])
    expect(useMessageStore.getState().currentRound.agent_a).toBe(1)

    store.processWSEvent({
      type: 'restart',
      session_id: 'session-1',
      timestamp: 3,
      sequence: 3,
      reason: 'Needs another round',
      instructions: 'Try again',
      attempt: 2,
      max_attempts: 3,
    })

    expect(
      useMessageStore.getState().messages.agent_a.map((message) =>
        message.type === 'round-divider' ? message.roundNumber : null
      )
    ).toEqual([1])
    expect(useMessageStore.getState().currentRound.agent_a).toBe(1)

    store.processWSEvent({
      type: 'structured_event',
      session_id: 'session-1',
      timestamp: 4,
      sequence: 4,
      event_type: 'round_start',
      agent_id: 'agent_a',
      round_number: 1,
      data: {},
    } as unknown as WSEvent)

    expect(
      useMessageStore.getState().messages.agent_a.map((message) =>
        message.type === 'round-divider' ? message.roundNumber : null
      )
    ).toEqual([1, 2])
    expect(useMessageStore.getState().currentRound.agent_a).toBe(2)
  })

  it('falls back to the next round number when round_start omits round_number', () => {
    const store = useMessageStore.getState()

    store.processWSEvent({
      type: 'init',
      session_id: 'session-2',
      timestamp: 1,
      sequence: 1,
      question: 'Ship it again',
      agents: ['agent_a'],
      theme: 'dark',
    })

    store.processWSEvent({
      type: 'structured_event',
      session_id: 'session-2',
      timestamp: 2,
      sequence: 2,
      event_type: 'round_start',
      agent_id: 'agent_a',
      data: {},
    } as unknown as WSEvent)

    store.processWSEvent({
      type: 'structured_event',
      session_id: 'session-2',
      timestamp: 3,
      sequence: 3,
      event_type: 'round_start',
      agent_id: 'agent_a',
      data: {},
    } as unknown as WSEvent)

    expect(
      useMessageStore.getState().messages.agent_a.map((message) =>
        message.type === 'round-divider' ? message.roundNumber : null
      )
    ).toEqual([1, 2])
  })

  it('deduplicates legacy new_answer events when the same answer already arrived as a structured event', () => {
    const store = useMessageStore.getState()

    store.processWSEvent({
      type: 'init',
      session_id: 'session-3',
      timestamp: 1,
      sequence: 1,
      question: 'Write a poem',
      agents: ['agent_a'],
      theme: 'dark',
    })

    store.processWSEvent({
      type: 'structured_event',
      session_id: 'session-3',
      timestamp: 2,
      sequence: 2,
      event_type: 'answer_submitted',
      agent_id: 'agent_a',
      data: {
        answer_label: 'agent1.1',
        answer_number: 1,
        content: 'Love is the quiet between two breaths.',
      },
    } as unknown as WSEvent)

    store.processWSEvent({
      type: 'new_answer',
      session_id: 'session-3',
      timestamp: 2,
      sequence: 3,
      agent_id: 'agent_a',
      answer_label: 'agent1.1',
      answer_number: 1,
      content: 'Love is the quiet between two breaths.',
    } as unknown as WSEvent)

    expect(
      useMessageStore.getState().messages.agent_a.filter(
        (message) => message.type === 'answer'
      )
    ).toHaveLength(1)
  })

  it('deduplicates legacy vote_cast events when the same vote already arrived as a structured event', () => {
    const store = useMessageStore.getState()

    store.processWSEvent({
      type: 'init',
      session_id: 'session-4',
      timestamp: 1,
      sequence: 1,
      question: 'Vote on the poem',
      agents: ['agent_a'],
      theme: 'dark',
    })

    store.processWSEvent({
      type: 'structured_event',
      session_id: 'session-4',
      timestamp: 2,
      sequence: 2,
      event_type: 'round_start',
      agent_id: 'agent_a',
      round_number: 1,
      data: {},
    } as unknown as WSEvent)

    store.processWSEvent({
      type: 'structured_event',
      session_id: 'session-4',
      timestamp: 3,
      sequence: 3,
      event_type: 'vote',
      agent_id: 'agent_a',
      data: {
        target_id: 'agent_a',
        reason:
          'Agent1 directly satisfies the original request with a complete, polished love poem.',
      },
    } as unknown as WSEvent)

    store.processWSEvent({
      type: 'vote_cast',
      session_id: 'session-4',
      timestamp: 3,
      sequence: 4,
      voter_id: 'agent_a',
      target_id: 'agent_a',
      reason:
        'Agent1 directly satisfies the original request with a complete, polished love poem.',
    } as unknown as WSEvent)

    expect(
      useMessageStore.getState().messages.agent_a.filter(
        (message) => message.type === 'vote'
      )
    ).toHaveLength(1)
  })

  it('hydrates currentPhase from a restored state snapshot', () => {
    const store = useMessageStore.getState()

    store.processWSEvent({
      type: 'state_snapshot',
      session_id: 'session-5',
      timestamp: 1,
      sequence: 1,
      agents: ['agent_a'],
      question: 'Resume the run',
      current_phase: 'coordinating',
    } as unknown as WSEvent)

    expect(useMessageStore.getState().currentPhase).toBe('coordinating')
  })
})

describe('useMessageStore hook_execution processing', () => {
  beforeEach(() => {
    useMessageStore.getState().reset()
  })

  it('attaches pre-hook to matching tool call by tool_call_id', () => {
    const store = useMessageStore.getState()

    store.processWSEvent({
      type: 'init',
      session_id: 's1',
      timestamp: 1,
      sequence: 1,
      question: 'Test hooks',
      agents: ['agent_a'],
      theme: 'dark',
    })

    // Emit a tool_start
    store.processWSEvent({
      type: 'structured_event',
      session_id: 's1',
      timestamp: 2,
      sequence: 2,
      event_type: 'tool_start',
      agent_id: 'agent_a',
      data: { tool_id: 'tc_001', tool_name: 'read_file', args: { path: '/tmp/x' } },
    } as unknown as WSEvent)

    // Emit hook_execution for that tool
    store.processWSEvent({
      type: 'hook_execution',
      session_id: 's1',
      timestamp: 3,
      sequence: 3,
      agent_id: 'agent_a',
      tool_call_id: 'tc_001',
      hook_info: {
        hook_name: 'validate_path',
        hook_type: 'pre',
        decision: 'allow',
        reason: 'Path is safe',
        execution_time_ms: 12,
      },
    } as unknown as WSEvent)

    const msgs = useMessageStore.getState().messages.agent_a
    expect(msgs).toHaveLength(1)
    const toolMsg = msgs[0] as { type: string; preHooks?: unknown[]; postHooks?: unknown[] }
    expect(toolMsg.type).toBe('tool-call')
    expect(toolMsg.preHooks).toHaveLength(1)
    expect(toolMsg.preHooks![0]).toMatchObject({
      hook_name: 'validate_path',
      hook_type: 'pre',
      decision: 'allow',
    })
    expect(toolMsg.postHooks).toBeUndefined()
  })

  it('attaches post-hook to matching tool call', () => {
    const store = useMessageStore.getState()

    store.processWSEvent({
      type: 'init',
      session_id: 's2',
      timestamp: 1,
      sequence: 1,
      question: 'Test hooks',
      agents: ['agent_a'],
      theme: 'dark',
    })

    store.processWSEvent({
      type: 'structured_event',
      session_id: 's2',
      timestamp: 2,
      sequence: 2,
      event_type: 'tool_start',
      agent_id: 'agent_a',
      data: { tool_id: 'tc_002', tool_name: 'write_file', args: {} },
    } as unknown as WSEvent)

    store.processWSEvent({
      type: 'hook_execution',
      session_id: 's2',
      timestamp: 3,
      sequence: 3,
      agent_id: 'agent_a',
      tool_call_id: 'tc_002',
      hook_info: {
        hook_name: 'log_write',
        hook_type: 'post',
        decision: 'allow',
        execution_time_ms: 5,
        injection_content: 'File written successfully',
      },
    } as unknown as WSEvent)

    const msgs = useMessageStore.getState().messages.agent_a
    const toolMsg = msgs[0] as { postHooks?: Array<{ hook_name: string; injection_content?: string }> }
    expect(toolMsg.postHooks).toHaveLength(1)
    expect(toolMsg.postHooks![0].hook_name).toBe('log_write')
    expect(toolMsg.postHooks![0].injection_content).toBe('File written successfully')
  })

  it('attaches hook to most recent tool call when no tool_call_id matches', () => {
    const store = useMessageStore.getState()

    store.processWSEvent({
      type: 'init',
      session_id: 's3',
      timestamp: 1,
      sequence: 1,
      question: 'Test hooks',
      agents: ['agent_a'],
      theme: 'dark',
    })

    store.processWSEvent({
      type: 'structured_event',
      session_id: 's3',
      timestamp: 2,
      sequence: 2,
      event_type: 'tool_start',
      agent_id: 'agent_a',
      data: { tool_name: 'search', args: {} },
    } as unknown as WSEvent)

    // Hook with no tool_call_id
    store.processWSEvent({
      type: 'hook_execution',
      session_id: 's3',
      timestamp: 3,
      sequence: 3,
      agent_id: 'agent_a',
      hook_info: {
        hook_name: 'audit',
        hook_type: 'pre',
        decision: 'deny',
        reason: 'Restricted',
      },
    } as unknown as WSEvent)

    const msgs = useMessageStore.getState().messages.agent_a
    const toolMsg = msgs[0] as { preHooks?: Array<{ decision: string }> }
    expect(toolMsg.preHooks).toHaveLength(1)
    expect(toolMsg.preHooks![0].decision).toBe('deny')
  })

  it('accumulates multiple hooks on the same tool call', () => {
    const store = useMessageStore.getState()

    store.processWSEvent({
      type: 'init',
      session_id: 's4',
      timestamp: 1,
      sequence: 1,
      question: 'Test hooks',
      agents: ['agent_a'],
      theme: 'dark',
    })

    store.processWSEvent({
      type: 'structured_event',
      session_id: 's4',
      timestamp: 2,
      sequence: 2,
      event_type: 'tool_start',
      agent_id: 'agent_a',
      data: { tool_id: 'tc_x', tool_name: 'exec', args: {} },
    } as unknown as WSEvent)

    store.processWSEvent({
      type: 'hook_execution',
      session_id: 's4',
      timestamp: 3,
      sequence: 3,
      agent_id: 'agent_a',
      tool_call_id: 'tc_x',
      hook_info: { hook_name: 'hook1', hook_type: 'pre', decision: 'allow' },
    } as unknown as WSEvent)

    store.processWSEvent({
      type: 'hook_execution',
      session_id: 's4',
      timestamp: 4,
      sequence: 4,
      agent_id: 'agent_a',
      tool_call_id: 'tc_x',
      hook_info: { hook_name: 'hook2', hook_type: 'pre', decision: 'allow' },
    } as unknown as WSEvent)

    store.processWSEvent({
      type: 'hook_execution',
      session_id: 's4',
      timestamp: 5,
      sequence: 5,
      agent_id: 'agent_a',
      tool_call_id: 'tc_x',
      hook_info: { hook_name: 'hook3', hook_type: 'post', decision: 'error', reason: 'timeout' },
    } as unknown as WSEvent)

    const msgs = useMessageStore.getState().messages.agent_a
    const toolMsg = msgs[0] as { preHooks?: unknown[]; postHooks?: unknown[] }
    expect(toolMsg.preHooks).toHaveLength(2)
    expect(toolMsg.postHooks).toHaveLength(1)
  })
})

describe('useMessageStore subagent message arrays', () => {
  beforeEach(() => {
    useMessageStore.getState().reset()
  })

  it('initializes message array for subagent IDs on subagent_spawn', () => {
    const store = useMessageStore.getState()

    store.processWSEvent({
      type: 'init',
      session_id: 's1',
      timestamp: 1,
      sequence: 1,
      question: 'Test subagents',
      agents: ['agent_a'],
      theme: 'dark',
    })

    store.processWSEvent({
      type: 'subagent_spawn',
      session_id: 's1',
      timestamp: 2,
      sequence: 2,
      agent_id: 'agent_a',
      subagent_ids: ['subagent_a_0', 'subagent_a_1'],
      task: 'Build feature',
      call_id: 'call_1',
    } as unknown as WSEvent)

    const state = useMessageStore.getState()
    expect(state.messages.subagent_a_0).toEqual([])
    expect(state.messages.subagent_a_1).toEqual([])
  })

  it('initializes message array for subagent ID on subagent_started', () => {
    const store = useMessageStore.getState()

    store.processWSEvent({
      type: 'init',
      session_id: 's2',
      timestamp: 1,
      sequence: 1,
      question: 'Test subagents',
      agents: ['agent_a'],
      theme: 'dark',
    })

    store.processWSEvent({
      type: 'subagent_started',
      session_id: 's2',
      timestamp: 2,
      sequence: 2,
      agent_id: 'agent_a',
      subagent_id: 'subagent_a_0',
      task: 'Build feature',
      timeout_seconds: 300,
    } as unknown as WSEvent)

    const state = useMessageStore.getState()
    expect(state.messages.subagent_a_0).toEqual([])
  })

  it('stores structured_event messages for initialized subagent IDs', () => {
    const store = useMessageStore.getState()

    store.processWSEvent({
      type: 'init',
      session_id: 's3',
      timestamp: 1,
      sequence: 1,
      question: 'Test subagents',
      agents: ['agent_a'],
      theme: 'dark',
    })

    store.processWSEvent({
      type: 'subagent_started',
      session_id: 's3',
      timestamp: 2,
      sequence: 2,
      agent_id: 'agent_a',
      subagent_id: 'subagent_a_0',
      task: 'Build feature',
    } as unknown as WSEvent)

    // Now send a structured text event for the subagent
    store.processWSEvent({
      type: 'structured_event',
      session_id: 's3',
      timestamp: 3,
      sequence: 3,
      event_type: 'text',
      agent_id: 'subagent_a_0',
      data: { content: 'Hello from subagent' },
    } as unknown as WSEvent)

    const msgs = useMessageStore.getState().messages.subagent_a_0
    expect(msgs).toHaveLength(1)
    expect(msgs[0].type).toBe('content')
  })

  it('drops structured_event messages for uninitialized subagent IDs', () => {
    const store = useMessageStore.getState()

    store.processWSEvent({
      type: 'init',
      session_id: 's4',
      timestamp: 1,
      sequence: 1,
      question: 'Test subagents',
      agents: ['agent_a'],
      theme: 'dark',
    })

    // Send a structured text event for a subagent that was never initialized
    store.processWSEvent({
      type: 'structured_event',
      session_id: 's4',
      timestamp: 2,
      sequence: 2,
      event_type: 'text',
      agent_id: 'subagent_unknown',
      data: { content: 'Ghost message' },
    } as unknown as WSEvent)

    expect(useMessageStore.getState().messages.subagent_unknown).toBeUndefined()
  })
})
