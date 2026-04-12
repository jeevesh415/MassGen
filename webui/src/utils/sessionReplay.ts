import { useAgentStore } from '../stores/agentStore'
import { useMessageStore } from '../stores/v2/messageStore'
import type { WSEvent } from '../types'

export function replaySessionEvents(
  sessionId: string,
  events: Array<Record<string, unknown>>
): boolean {
  if (events.length === 0) {
    return false
  }

  const messageStore = useMessageStore.getState()
  const agentStore = useAgentStore.getState()

  for (const event of events) {
    const typedEvent = event as Record<string, unknown>

    if (
      typedEvent.type === 'init' &&
      Array.isArray(typedEvent.agents) &&
      typeof typedEvent.question === 'string'
    ) {
      agentStore.initSession(
        sessionId,
        typedEvent.question,
        typedEvent.agents as string[],
        typeof typedEvent.theme === 'string' ? typedEvent.theme : 'dark',
        typedEvent.agent_models as Record<string, string> | undefined
      )
    }

    messageStore.processWSEvent(typedEvent as unknown as WSEvent)
  }

  return true
}
