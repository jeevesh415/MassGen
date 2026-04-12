import type { Answer } from '../types'

export interface WorkspaceVersionOption {
  value: string
  label: string
  kind: 'live' | 'historical'
}

export function getAgentIdFromWorkspacePath(
  workspacePath: string,
  agentOrder: string[],
  liveWorkspacePaths: string[] = []
): string | null {
  const normalizedPath = workspacePath.replace(/\/+$/, '')
  const agentMatch = normalizedPath.match(/(?:^|\/)(agent_[a-z0-9_]+)(?:\/|$)/i)
  if (agentMatch) {
    const candidate = agentMatch[1].toLowerCase()
    if (agentOrder.includes(candidate)) {
      return candidate
    }
  }

  const workspaceMatch = normalizedPath.match(/workspace(\d+)(?:$|\/)/i)
  if (workspaceMatch) {
    const index = parseInt(workspaceMatch[1], 10) - 1
    return agentOrder[index] || null
  }

  if (agentOrder.length === 1 && liveWorkspacePaths.length === 1 && normalizedPath === liveWorkspacePaths[0].replace(/\/+$/, '')) {
    return agentOrder[0]
  }

  return null
}

export function getAgentWorkspaceLabel(agentId: string, agentOrder: string[]): string {
  const index = agentOrder.indexOf(agentId)
  return index >= 0 ? `Agent ${index + 1}` : agentId
}

export function getAnswerWorkspaceLabel(answerNumber: number): string {
  return `Answer ${answerNumber}`
}

export function getWorkspaceVersionOptions(params: {
  agentId: string
  answers: Answer[]
  liveWorkspacePath?: string
  liveLabel?: string
}): WorkspaceVersionOption[] {
  const {
    agentId,
    answers,
    liveWorkspacePath,
    liveLabel = 'Live',
  } = params

  const options: WorkspaceVersionOption[] = []
  if (liveWorkspacePath) {
    options.push({
      value: liveWorkspacePath,
      label: liveLabel,
      kind: 'live',
    })
  }

  const historicalAnswers = answers
    .filter((answer) => answer.agentId === agentId && answer.answerNumber > 0 && answer.workspacePath)
    .sort((left, right) => right.answerNumber - left.answerNumber)

  for (const answer of historicalAnswers) {
    const workspacePath = answer.workspacePath
    if (!workspacePath) continue

    options.push({
      value: workspacePath,
      label: getAnswerWorkspaceLabel(answer.answerNumber),
      kind: 'historical',
    })
  }

  return options
}
