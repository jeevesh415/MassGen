/**
 * MassGen Web UI Type Definitions
 */

// Agent status types
export type AgentStatus = 'waiting' | 'working' | 'voting' | 'completed' | 'failed';

// WebSocket event types (match Python WebDisplay events)
export type WSEventType =
  | 'init'
  | 'init_status'
  | 'agent_content'
  | 'agent_status'
  | 'orchestrator_event'
  | 'vote_cast'
  | 'vote_distribution'
  | 'consensus_reached'
  | 'final_answer'
  | 'new_answer'
  | 'post_evaluation'
  | 'file_change'
  | 'tool_call'
  | 'tool_result'
  | 'restart'
  | 'restart_context'
  | 'error'
  | 'done'
  | 'state_snapshot'
  | 'coordination_started'
  | 'coordination_complete'
  | 'preparation_status'
  | 'keepalive'
  | 'timeout_status'
  | 'hook_execution'
  | 'checkpoint_started'
  | 'checkpoint_completed'
  | 'checkpoint_action_executed'
  | 'review_request'
  | 'review_resolved';

// Base WebSocket message
export interface WSMessage {
  type: WSEventType;
  session_id: string;
  timestamp: number;
  sequence: number;
}

// Agent info with model name
export interface AgentInfo {
  id: string;
  model?: string;  // Model name like "gpt-5", "claude-3.5-sonnet"
}

// Specific event payloads
export interface InitEvent extends WSMessage {
  type: 'init';
  question: string;
  log_filename?: string;
  agents: string[];
  agent_models?: Record<string, string>;  // Map of agent_id -> model name
  theme: string;
}

// Initialization status (shown during config loading, agent setup, etc.)
export interface InitStatus {
  message: string;
  step: string;  // 'config' | 'agents' | 'agents_ready' | 'orchestrator' | 'starting'
  progress: number;  // 0-100
}

export interface InitStatusEvent extends WSMessage {
  type: 'init_status';
  message: string;
  step: string;
  progress: number;
}

export interface AgentContentEvent extends WSMessage {
  type: 'agent_content';
  agent_id: string;
  content: string;
  content_type: 'thinking' | 'tool' | 'status';
}

export interface AgentStatusEvent extends WSMessage {
  type: 'agent_status';
  agent_id: string;
  status: AgentStatus;
}

export interface OrchestratorEvent extends WSMessage {
  type: 'orchestrator_event';
  event: string;
}

export interface VoteCastEvent extends WSMessage {
  type: 'vote_cast';
  voter_id: string;
  target_id: string;
  reason: string;
}

export interface VoteDistributionEvent extends WSMessage {
  type: 'vote_distribution';
  votes: Record<string, number>;
}

export interface ConsensusReachedEvent extends WSMessage {
  type: 'consensus_reached';
  winner_id: string;
  vote_distribution: Record<string, number>;
}

export interface FinalAnswerEvent extends WSMessage {
  type: 'final_answer';
  answer: string;
  vote_results: VoteResults;
  selected_agent: string;
}

export interface NewAnswerEvent extends WSMessage {
  type: 'new_answer';
  agent_id: string;
  answer_id: string;
  answer_number: number;
  content: string;
  answer_label?: string;
  workspace_path?: string;
  submission_round?: number;
}

export interface FileChangeEvent extends WSMessage {
  type: 'file_change';
  agent_id: string;
  path: string;
  operation: 'create' | 'modify' | 'delete';
  content_preview?: string;
}

export interface ToolCallEvent extends WSMessage {
  type: 'tool_call';
  agent_id: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  tool_id?: string;
}

export interface ToolResultEvent extends WSMessage {
  type: 'tool_result';
  agent_id: string;
  tool_name: string;
  result: string;
  tool_id?: string;
  success: boolean;
}

export interface RestartEvent extends WSMessage {
  type: 'restart';
  reason: string;
  instructions: string;
  attempt: number;
  max_attempts: number;
}

export interface ErrorEvent extends WSMessage {
  type: 'error';
  message: string;
  agent_id?: string;
}

export interface PreparationStatusEvent extends WSMessage {
  type: 'preparation_status';
  status: string;
  detail?: string;
}

// Timeout status for per-agent timeout display
export interface TimeoutState {
  round_number: number;
  round_start_time: number | null;
  active_timeout: number | null;
  grace_seconds: number;
  elapsed: number | null;
  remaining_soft: number | null;
  remaining_hard: number | null;
  soft_timeout_fired: boolean;
  is_hard_blocked: boolean;
}

export interface TimeoutStatusEvent extends WSMessage {
  type: 'timeout_status';
  agent_id: string;
  timeout_state: TimeoutState;
}

// Hook execution information for display
export interface HookExecutionInfo {
  hook_name: string;
  hook_type: 'pre' | 'post';
  decision: 'allow' | 'deny' | 'error';
  reason?: string;
  execution_time_ms?: number;
  injection_preview?: string;
  injection_content?: string;
}

export interface HookExecutionEvent extends WSMessage {
  type: 'hook_execution';
  agent_id: string;
  tool_call_id?: string;
  hook_info: HookExecutionInfo;
}

// Checkpoint coordination events
export interface CheckpointStartedEvent extends WSMessage {
  type: 'checkpoint_started';
  checkpoint_number: number;
  task: string;
  context?: string;
  expected_actions?: { tool: string; description: string }[];
}

export interface CheckpointCompletedEvent extends WSMessage {
  type: 'checkpoint_completed';
  checkpoint_number: number;
  consensus: string;
  workspace_changes: { file: string; change: string }[];
  action_results: { tool: string; executed: boolean; result?: unknown }[];
}

export interface CheckpointActionExecutedEvent extends WSMessage {
  type: 'checkpoint_action_executed';
  checkpoint_number: number;
  tool: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

// Vote results structure
export interface VoteResults {
  vote_counts?: Record<string, number>;
  voter_details?: Record<string, { voter: string; reason: string }[]>;
  winner?: string;
  is_tie?: boolean;
  total_votes?: number;
  agents_voted?: number;
}

// Round of agent output (for restart/new answer separation)
export interface AgentRound {
  id: string;
  roundNumber: number;
  type: 'answer' | 'vote' | 'final';
  label: string;  // e.g., "answer1.1", "vote1", or "final"
  content: string;
  startTimestamp: number;
  endTimestamp?: number;
  workspacePath?: string;  // Path to workspace snapshot for this answer
}

// Agent state in store
export interface AgentState {
  id: string;
  modelName?: string;  // e.g., "gpt-5" for display as "agent_a (gpt-5)"
  status: AgentStatus;
  content: string[];
  currentContent: string;
  rounds: AgentRound[];  // History of rounds for dropdown
  currentRoundId: string;  // Where NEW streaming content appends
  displayRoundId: string;  // What the dropdown shows (user-selectable)
  voteTarget?: string;
  voteReason?: string;
  voteRound?: number;  // Which voting round this vote was cast in (for invalidation tracking)
  answerCount: number;
  voteCount: number;  // Track votes for labeling
  files: FileInfo[];
  toolCalls: ToolCallInfo[];
  workspacePath?: string;  // Current workspace path for this agent (from status.json)
  timeoutState?: TimeoutState;  // Per-agent timeout countdown state
}

export interface FileInfo {
  path: string;
  operation: 'create' | 'modify' | 'delete';
  timestamp: number;
  contentPreview?: string;
}

export interface ToolCallInfo {
  id?: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  success?: boolean;
  timestamp: number;
  preHooks?: HookExecutionInfo[];   // Hooks that ran before tool
  postHooks?: HookExecutionInfo[];  // Hooks that ran after tool
}

// Answer from an agent
export interface Answer {
  id: string;
  agentId: string;
  answerNumber: number;
  content: string;
  timestamp: number;
  votes: number;
  isWinner?: boolean;
  workspacePath?: string;  // Path to workspace snapshot for this answer
}

// Workspace linked to specific answer version
export interface AnswerWorkspace {
  answerId: string;
  agentId: string;
  answerNumber: number;
  answerLabel: string;
  timestamp: string;
  workspacePath: string;
}

// View mode for UI
// - 'coordination': Shows all agents in carousel during coordination
// - 'finalStreaming': Shows winner agent streaming final answer after consensus
// - 'finalComplete': Shows full-screen final answer view when complete
export type ViewMode = 'coordination' | 'finalStreaming' | 'finalComplete';

// Per-agent UI state (stored in Zustand for persistence across re-renders)
export interface AgentUIState {
  dropdownOpen: boolean;
}

// Conversation message for multi-turn
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  turn?: number;
}

// Full session state
// Record of a vote for history tracking
export interface VoteRecord {
  voterId: string;
  targetId: string;
  reason: string;
  voteRound: number;
  timestamp: number;
  votedAnswerLabel?: string;  // e.g., "answer1.2"
}

export interface SessionState {
  sessionId: string;
  question: string;
  agents: Record<string, AgentState>;
  agentOrder: string[];
  answers: Answer[];
  voteDistribution: Record<string, number>;
  voteHistory: VoteRecord[];  // All votes across all rounds (for history display)
  currentVotingRound: number;  // Track which voting round we're in (increments when new answer submitted)
  selectedAgent?: string;
  finalAnswer?: string;
  orchestratorEvents: string[];
  isComplete: boolean;
  selectingWinner: boolean;  // True when all votes are in but winner not yet selected
  error?: string;
  theme: string;
  viewMode: ViewMode;  // 'coordination' shows all agents, 'winner' shows only winner
  // Multi-turn conversation state
  turnNumber: number;
  conversationHistory: ConversationMessage[];
  // Per-agent UI state for dropdown tracking
  agentUIState: Record<string, AgentUIState>;
  // Skip animation when restoring from snapshot
  restoredFromSnapshot: boolean;
  // Automation mode: shows simplified timeline view for LLM/automation usage
  automationMode: boolean;
  // Log directory path for status.json monitoring
  logDir?: string;
  // Initialization status (shown during config loading, agent setup, etc.)
  initStatus?: InitStatus;
  // Preparation status during initialization (before agents start)
  preparationStatus?: string;
  preparationDetail?: string;
}

// Union type for all WebSocket events
export type WSEvent =
  | InitEvent
  | InitStatusEvent
  | AgentContentEvent
  | AgentStatusEvent
  | OrchestratorEvent
  | VoteCastEvent
  | VoteDistributionEvent
  | ConsensusReachedEvent
  | FinalAnswerEvent
  | NewAnswerEvent
  | FileChangeEvent
  | ToolCallEvent
  | ToolResultEvent
  | RestartEvent
  | ErrorEvent
  | PreparationStatusEvent
  | TimeoutStatusEvent
  | HookExecutionEvent
  | WSMessage;

// Review modal types (WebUI git diff review)
export interface ReviewFileChange {
  status: 'M' | 'A' | 'D';
  path: string;
}

export interface ReviewChangeContext {
  original_path: string;
  isolated_path: string;
  repo_root?: string;
  base_ref?: string;
  context_prefix?: string;
  changes: ReviewFileChange[];
  diff: string;
}

export interface ReviewRequestEvent extends WSMessage {
  type: 'review_request';
  changes: ReviewChangeContext[];
  answer_content: string;
  vote_results: Record<string, unknown>;
  agent_id: string;
  model_name: string;
  context_paths?: Record<string, string[]>;
}

export interface ReviewResolvedEvent extends WSMessage {
  type: 'review_resolved';
  approved: boolean;
  resolved_by: string;
}

// Config file info from API
export interface ConfigInfo {
  name: string;
  path: string;
  category: string;
  relative: string;
}

// Session info from API
export interface SessionInfo {
  session_id: string;
  connections: number;
  has_display: boolean;
  is_running: boolean;
  question?: string;
  status?: 'active' | 'completed';
  completed_at?: number;
  config?: string;
  config_path?: string;
  models?: string[];
  start_time?: string;
  log_dir?: string;
}

// ============================================================================
// Timeline Types (for Answer Timeline visualization)
// ============================================================================

// Timeline node types
export type TimelineNodeType = 'answer' | 'vote' | 'final';

// A single node on the timeline
export interface TimelineNode {
  id: string;
  type: TimelineNodeType;
  agentId: string;
  label: string;           // e.g., "answer1.1", "vote1.1", "final"
  timestamp: number;
  round: number;
  contextSources: string[];  // Labels of answers used as context
  votedFor?: string;         // For vote nodes: which agent was voted for
}

// Timeline data for visualization
export interface TimelineData {
  nodes: TimelineNode[];
  agents: string[];
  startTime: number;
  endTime?: number;
  currentVotingRound?: number;  // For determining which votes are superseded
}

// ============================================================================
// File Viewer Types (for Workspace File Viewer)
// ============================================================================

// Response from /api/workspace/file endpoint
export interface FileContentResponse {
  content: string;
  binary: boolean;
  size: number;
  mimeType: string;
  language: string;  // For syntax highlighting (e.g., "python", "typescript")
  error?: string;
}

// ============================================================================
// Workspace Browser WebSocket Types (for pre-fetched workspace file lists)
// ============================================================================

/**
 * WebSocket event types for workspace file listing.
 * File lists are pre-fetched on connect and refreshed on-demand.
 * No live file monitoring - uses simple pre-fetch + cache pattern.
 */
export type WorkspaceWSEventType =
  | 'workspace_connected'
  | 'workspace_error'
  | 'workspace_refresh';

/**
 * Base message for workspace WebSocket communication.
 */
export interface WorkspaceWSMessage {
  type: WorkspaceWSEventType;
  session_id: string;
  timestamp: number;
}

/**
 * Event sent when WebSocket connection is established.
 * Includes initial file lists for each workspace to enable instant modal open.
 */
export interface WorkspaceConnectedEvent extends WorkspaceWSMessage {
  type: 'workspace_connected';
  watched_paths: string[];
  /** Initial file lists keyed by workspace path - sent on connect for instant display */
  initial_files?: Record<string, WorkspaceFileInfo[]>;
  workspace_metadata?: Record<string, { agent_id?: string }>;
}

/**
 * Event sent when an error occurs in workspace operations.
 */
export interface WorkspaceErrorEvent extends WorkspaceWSMessage {
  type: 'workspace_error';
  error: string;
  workspace_path?: string;
}

/**
 * Event sent in response to a refresh request with updated file list.
 */
export interface WorkspaceRefreshEvent extends WorkspaceWSMessage {
  type: 'workspace_refresh';
  workspace_path: string;
  files: WorkspaceFileInfo[];
  agent_id?: string;
}

/**
 * File metadata for workspace browser.
 */
export interface WorkspaceFileInfo {
  path: string;
  size: number;
  modified: number;
}

/**
 * Union type for all workspace WebSocket events.
 */
export type WorkspaceWSEvent =
  | WorkspaceConnectedEvent
  | WorkspaceErrorEvent
  | WorkspaceRefreshEvent;
