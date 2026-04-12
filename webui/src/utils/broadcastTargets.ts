/**
 * Parse @mentions from a broadcast message.
 * - `@all` -> targets: null (broadcast to all agents)
 * - `@agent_name` -> targets: ["agent_name"]
 * - Multiple `@mentions` -> targets: ["agent1", "agent2"]
 * - No mentions -> targets: null (broadcast to all by default)
 * Returns { cleanMessage, targets }.
 */
export function parseBroadcastTargets(message: string): {
  cleanMessage: string;
  targets: string[] | null;
} {
  const mentionRegex = /@([\w-]+)/g;
  const mentions: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(message)) !== null) {
    mentions.push(match[1]);
  }

  if (mentions.length === 0) {
    // No mentions — broadcast to all by default
    return { cleanMessage: message.trim(), targets: null };
  }

  if (mentions.includes('all')) {
    // @all — broadcast to everyone, strip @all from message
    const cleanMessage = message.replace(/@all\b/g, '').trim();
    return { cleanMessage: cleanMessage || message.trim(), targets: null };
  }

  // Targeted broadcast — strip @mentions from the message
  const cleanMessage = message.replace(/@[\w-]+/g, '').trim();
  return { cleanMessage: cleanMessage || message.trim(), targets: mentions };
}
