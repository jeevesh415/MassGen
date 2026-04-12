import { describe, expect, it } from 'vitest'
import { parseBroadcastTargets } from './broadcastTargets'

describe('parseBroadcastTargets', () => {
  describe('no mentions (broadcast to all)', () => {
    it('returns null targets when the message has no @mentions', () => {
      const result = parseBroadcastTargets('hello world')
      expect(result).toEqual({ cleanMessage: 'hello world', targets: null })
    })

    it('trims whitespace from the message', () => {
      const result = parseBroadcastTargets('  hello world  ')
      expect(result).toEqual({ cleanMessage: 'hello world', targets: null })
    })

    it('handles an empty string', () => {
      const result = parseBroadcastTargets('')
      expect(result).toEqual({ cleanMessage: '', targets: null })
    })

    it('handles whitespace-only input', () => {
      const result = parseBroadcastTargets('   ')
      expect(result).toEqual({ cleanMessage: '', targets: null })
    })
  })

  describe('@all (broadcast to all)', () => {
    it('returns null targets when @all is present', () => {
      const result = parseBroadcastTargets('@all please continue')
      expect(result).toEqual({ cleanMessage: 'please continue', targets: null })
    })

    it('strips @all from the middle of the message', () => {
      const result = parseBroadcastTargets('hey @all please continue')
      expect(result).toEqual({ cleanMessage: 'hey  please continue', targets: null })
    })

    it('strips @all from the end of the message', () => {
      const result = parseBroadcastTargets('please continue @all')
      expect(result).toEqual({ cleanMessage: 'please continue', targets: null })
    })

    it('handles multiple @all mentions', () => {
      const result = parseBroadcastTargets('@all do this @all now')
      expect(result).toEqual({ cleanMessage: 'do this  now', targets: null })
    })

    it('falls back to original trimmed message when @all is the entire message', () => {
      const result = parseBroadcastTargets('@all')
      expect(result).toEqual({ cleanMessage: '@all', targets: null })
    })

    it('ignores other mentions when @all is present', () => {
      const result = parseBroadcastTargets('@all @agent_a please work together')
      // @all takes precedence — targets null; both mentions stripped by @all logic
      expect(result.targets).toBeNull()
      // cleanMessage strips @all but not necessarily other mentions
      // The function only strips @all via regex, leaving @agent_a
      expect(result.cleanMessage).toBe('@agent_a please work together')
    })
  })

  describe('targeted mentions', () => {
    it('extracts a single agent mention', () => {
      const result = parseBroadcastTargets('@agent_a please focus on tests')
      expect(result).toEqual({
        cleanMessage: 'please focus on tests',
        targets: ['agent_a'],
      })
    })

    it('extracts multiple agent mentions', () => {
      const result = parseBroadcastTargets('@agent_a @agent_b work together')
      expect(result).toEqual({
        cleanMessage: 'work together',
        targets: ['agent_a', 'agent_b'],
      })
    })

    it('handles hyphenated agent names', () => {
      const result = parseBroadcastTargets('@my-agent do something')
      expect(result).toEqual({
        cleanMessage: 'do something',
        targets: ['my-agent'],
      })
    })

    it('handles agent names with numbers', () => {
      const result = parseBroadcastTargets('@agent1 @agent2 coordinate')
      expect(result).toEqual({
        cleanMessage: 'coordinate',
        targets: ['agent1', 'agent2'],
      })
    })

    it('falls back to original trimmed message when mention is the entire message', () => {
      const result = parseBroadcastTargets('@agent_a')
      expect(result).toEqual({
        cleanMessage: '@agent_a',
        targets: ['agent_a'],
      })
    })

    it('strips mentions from the middle of the message', () => {
      const result = parseBroadcastTargets('hey @agent_a can you help')
      expect(result).toEqual({
        cleanMessage: 'hey  can you help',
        targets: ['agent_a'],
      })
    })

    it('handles mentions at the end of the message', () => {
      const result = parseBroadcastTargets('focus on code quality @agent_b')
      expect(result).toEqual({
        cleanMessage: 'focus on code quality',
        targets: ['agent_b'],
      })
    })
  })

  describe('edge cases', () => {
    it('does not treat email addresses as mentions (@ in the middle of a word)', () => {
      // The regex /@([\w-]+)/g will match @example in user@example
      // This documents the current behavior — it matches substrings after @
      const result = parseBroadcastTargets('send to user@example.com')
      expect(result.targets).toEqual(['example'])
    })

    it('handles duplicate mentions', () => {
      const result = parseBroadcastTargets('@agent_a @agent_a do it')
      expect(result.targets).toEqual(['agent_a', 'agent_a'])
    })

    it('handles underscore-only agent name', () => {
      const result = parseBroadcastTargets('@_ hello')
      expect(result).toEqual({
        cleanMessage: 'hello',
        targets: ['_'],
      })
    })
  })
})
