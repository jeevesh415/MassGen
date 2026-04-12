/**
 * Zustand Store for MassGen Agent State Management
 *
 * Manages all agent state, votes, and coordination events.
 * Updates from WebSocket events are processed here.
 */

import { create } from 'zustand';
import type {
  AgentRound,
  AgentState,
  AgentStatus,
  AgentUIState,
  Answer,
  FileInfo,
  SessionState,
  ToolCallInfo,
  ViewMode,
  VoteResults,
  WSEvent,
} from '../types';
import { useNotificationStore } from './notificationStore';
import { useWorkspaceStore } from './workspaceStore';

interface AgentStore extends SessionState {
  // Actions
  beginLaunch: (question: string) => void;
  initSession: (sessionId: string, question: string, agents: string[], theme: string, agentModels?: Record<string, string>) => void;
  updateAgentContent: (agentId: string, content: string, contentType: string) => void;
  updateAgentStatus: (agentId: string, status: AgentStatus) => void;
  addOrchestratorEvent: (event: string) => void;
  updateVoteDistribution: (votes: Record<string, number>) => void;
  recordVote: (voterId: string, targetId: string, reason: string) => void;
  setConsensus: (winnerId: string) => void;
  setFinalAnswer: (answer: string, voteResults: VoteResults, selectedAgent: string) => void;
  addAnswer: (answer: Answer) => void;
  addFileChange: (agentId: string, file: FileInfo) => void;
  addToolCall: (agentId: string, toolCall: ToolCallInfo) => void;
  updateToolResult: (agentId: string, toolId: string | undefined, result: string, success: boolean) => void;
  setError: (message: string) => void;
  setComplete: (isComplete: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  backToCoordination: () => void;
  fetchCleanFinalAnswer: () => Promise<void>;
  startNewRound: (agentId: string, roundType: 'answer' | 'vote' | 'final', customLabel?: string) => void;
  finalizeRoundWithLabel: (agentId: string, label: string, createNewRound?: boolean) => void;
  setAgentRound: (agentId: string, roundId: string) => void;
  reset: () => void;
  processWSEvent: (event: WSEvent) => void;
  // Multi-turn conversation actions
  addToConversationHistory: (role: 'user' | 'assistant', content: string) => void;
  startContinuation: (question: string) => void;
  // Per-agent UI state actions
  setAgentDropdownOpen: (agentId: string, open: boolean) => void;
  closeAllDropdowns: () => void;
  // Preparation status action
  setPreparationStatus: (status: string | undefined, detail?: string) => void;
}

const initialState: SessionState = {
  sessionId: '',
  question: '',
  agents: {},
  agentOrder: [],
  answers: [],
  voteDistribution: {},
  voteHistory: [],  // All votes across all rounds for history display
  currentVotingRound: 1,  // Track which voting round we're in (increments when new answer submitted)
  selectedAgent: undefined,
  finalAnswer: undefined,
  orchestratorEvents: [],
  isComplete: false,
  selectingWinner: false,
  error: undefined,
  theme: 'dark',
  viewMode: 'coordination',
  // Multi-turn conversation state
  turnNumber: 1,
  conversationHistory: [],
  // Per-agent UI state
  agentUIState: {},
  // Skip animation when restoring from snapshot
  restoredFromSnapshot: false,
  // Automation mode: shows simplified timeline view
  automationMode: false,
  logDir: undefined,
  // Initialization status (shown during config loading, agent setup, etc.)
  initStatus: undefined,
  // Preparation status during initialization
  preparationStatus: undefined,
  preparationDetail: undefined,
};

const createAgentUIState = (): AgentUIState => ({
  dropdownOpen: false,
});

const createAgentState = (id: string, modelName?: string): AgentState => {
  const initialRoundId = `${id}-round-0`;
  return {
    id,
    modelName,
    status: 'waiting',
    content: [],
    currentContent: '',
    rounds: [{
      id: initialRoundId,
      roundNumber: 0,
      type: 'answer',
      label: 'current',
      content: '',
      startTimestamp: Date.now(),
    }],
    currentRoundId: initialRoundId,
    displayRoundId: initialRoundId,
    answerCount: 0,
    voteCount: 0,
    files: [],
    toolCalls: [],
  };
};

export const useAgentStore = create<AgentStore>((set, get) => ({
  ...initialState,

  beginLaunch: (question) => {
    set({
      ...initialState,
      question,
      initStatus: {
        message: 'Submitting prompt...',
        step: 'request',
        progress: 3,
      },
      conversationHistory: [
        { role: 'user', content: question, turn: 1 },
      ],
      turnNumber: 1,
    });
  },

  initSession: (sessionId, question, agents, theme, agentModels) => {
    const agentStates: Record<string, AgentState> = {};
    const agentUIStates: Record<string, AgentUIState> = {};
    agents.forEach((id) => {
      agentStates[id] = createAgentState(id, agentModels?.[id]);
      agentUIStates[id] = createAgentUIState();
    });

    // Check if this is a continuation (turnNumber > 1 means startContinuation was called)
    // In that case, preserve the conversation history that startContinuation already set up
    const currentState = get();
    const isContinuation = currentState.turnNumber > 1 && currentState.conversationHistory.length > 0;

    set({
      sessionId,
      question,
      agents: agentStates,
      agentOrder: agents,
      answers: [],
      theme,
      isComplete: false,
      selectingWinner: false,
      error: undefined,
      voteDistribution: {},
      selectedAgent: undefined,
      finalAnswer: undefined,
      orchestratorEvents: [],
      viewMode: 'coordination',
      agentUIState: agentUIStates,
      restoredFromSnapshot: false,  // Reset for new sessions
      // Preserve conversation history if this is a continuation, otherwise start fresh
      ...(isContinuation
        ? {
            // Keep existing history and turnNumber from startContinuation
            conversationHistory: currentState.conversationHistory,
            turnNumber: currentState.turnNumber,
          }
        : {
            // Fresh start - add initial question to conversation history for Turn 1
            conversationHistory: [
              { role: 'user', content: question, turn: 1 },
            ],
            turnNumber: 1,
          }),
    });
  },

  updateAgentContent: (agentId, content, contentType) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      // Increment answer count if this looks like a new answer
      const newAnswerCount =
        contentType === 'status' && content.includes('new_answer')
          ? agent.answerCount + 1
          : agent.answerCount;

      // Update current round's content
      const updatedRounds = agent.rounds.map((round) =>
        round.id === agent.currentRoundId
          ? { ...round, content: round.content + content }
          : round
      );

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            content: [...agent.content, content],
            currentContent: agent.currentContent + content,
            rounds: updatedRounds,
            answerCount: newAnswerCount,
          },
        },
      };
    });
  },

  updateAgentStatus: (agentId, status) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            status,
          },
        },
      };
    });

    // Note: Transition to finalComplete is handled by fetchCleanFinalAnswer
    // after the clean answer is retrieved from the API
  },

  addOrchestratorEvent: (event) => {
    set((state) => ({
      orchestratorEvents: [...state.orchestratorEvents, event],
    }));
  },

  updateVoteDistribution: (votes) => {
    set({ voteDistribution: votes });
  },

  recordVote: (voterId, targetId, reason) => {
    set((state) => {
      const agent = state.agents[voterId];
      if (!agent) return state;

      const currentRound = state.currentVotingRound;

      // Check if this agent already voted in the CURRENT round (duplicate vote event)
      // If they already voted in this round, ignore the duplicate
      if (agent.voteRound === currentRound && agent.voteTarget) {
        console.log(`[AgentStore] Ignoring duplicate vote from ${voterId} in round ${currentRound}`);
        return state;
      }

      // Update vote distribution for this vote (only counts current round votes)
      const newDistribution = { ...state.voteDistribution };
      newDistribution[targetId] = (newDistribution[targetId] || 0) + 1;

      // Get the target agent's current answer count to compute the voted answer label
      const targetAgent = state.agents[targetId];
      const targetIdx = state.agentOrder.indexOf(targetId);
      const targetAnswerCount = targetAgent?.answerCount || 1;
      const votedAnswerLabel = `answer${targetIdx + 1}.${targetAnswerCount}`;

      // Add to vote history for permanent record (survives round resets)
      const newVoteRecord = {
        voterId,
        targetId,
        reason,
        voteRound: currentRound,
        timestamp: Date.now(),
        votedAnswerLabel,
      };

      // Update the agent with their vote and which round it was cast in
      const updatedAgent = {
        ...agent,
        voteTarget: targetId,
        voteReason: reason,
        voteRound: currentRound,
        voteCount: agent.voteCount + 1,
      };

      const updatedAgents = {
        ...state.agents,
        [voterId]: updatedAgent,
      };

      // Count how many agents have voted in THIS round (check voteRound matches currentRound)
      const agentCount = state.agentOrder.length;
      const votedCount = Object.values(updatedAgents).filter(
        a => a.voteRound === currentRound && a.voteTarget
      ).length;
      const allVoted = votedCount >= agentCount;

      return {
        agents: updatedAgents,
        voteDistribution: newDistribution,
        voteHistory: [...state.voteHistory, newVoteRecord],
        // Set selectingWinner when all agents have voted in current round
        selectingWinner: allVoted,
      };
    });
  },

  setConsensus: (winnerId) => {
    const store = get();

    // Close all dropdowns before transitioning to full-screen view
    store.closeAllDropdowns();

    // Clear the selectingWinner flag now that consensus is reached
    set({ selectingWinner: false });

    // Check the current round's status to decide how to handle it
    const agent = get().agents[winnerId];
    if (agent) {
      const currentRound = agent.rounds.find(r => r.id === agent.currentRoundId);

      if (currentRound && currentRound.label === 'current') {
        // Current round is still "current" (not finalized) - just rename it to 'final'
        // This preserves any content that's already streaming
        set((state) => {
          const agentState = state.agents[winnerId];
          if (!agentState) return state;

          const updatedRounds = agentState.rounds.map((round) =>
            round.id === agentState.currentRoundId
              ? { ...round, label: 'final' }
              : round
          );

          return {
            agents: {
              ...state.agents,
              [winnerId]: { ...agentState, rounds: updatedRounds },
            },
          };
        });
      } else {
        // Current round is already finalized (e.g., 'vote1.1')
        // Create a new 'final' round for the final answer content
        store.startNewRound(winnerId, 'final', 'final');
      }
    }

    // Set selected agent
    set({ selectedAgent: winnerId });

    // ALWAYS switch to finalStreaming view to show winner generating their final answer
    // The transition to finalComplete happens after fetchCleanFinalAnswer succeeds
    set({ viewMode: 'finalStreaming' });
  },

  setFinalAnswer: (_eventAnswer, _voteResults, selectedAgent) => {
    const now = Date.now();
    const store = get();

    // NOTE: We intentionally ignore eventAnswer here because it may contain
    // polluted orchestrator status messages (🏆 Selected Agent, 🎤 presenting, etc.)
    // The clean final answer will be fetched from the API via fetchCleanFinalAnswer()
    // which reads from the log file containing only the actual answer content.
    //
    // We use '__PENDING__' as a placeholder until the clean answer is fetched.
    set({
      finalAnswer: '__PENDING__',
      selectedAgent,
    });

    // Don't update the agent's round content with the polluted eventAnswer.
    // The agent's streaming content in their "final" round is the real content.

    // Add answer entry for the final answer (with pending content)
    const existingFinalAnswer = store.answers.find(
      a => a.agentId === selectedAgent && a.id.includes('-final')
    );

    if (!existingFinalAnswer && selectedAgent) {
      store.addAnswer({
        id: `${selectedAgent}-final-${now}`,
        agentId: selectedAgent,
        answerNumber: 0,  // Special: 0 indicates this is the final answer
        content: '__PENDING__',  // Will be updated by fetchCleanFinalAnswer
        timestamp: now,
        votes: 0,
        isWinner: true,
      });
    }
  },

  addAnswer: (answer) => {
    set((state) => {
      // Also update the agent's answer count
      const agent = state.agents[answer.agentId];
      const updatedAgents = agent
        ? {
            ...state.agents,
            [answer.agentId]: {
              ...agent,
              answerCount: Math.max(agent.answerCount, answer.answerNumber),
            },
          }
        : state.agents;

      return {
        answers: [...state.answers, answer],
        agents: updatedAgents,
      };
    });
  },

  addFileChange: (agentId, file) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            files: [...agent.files, file],
          },
        },
      };
    });
  },

  addToolCall: (agentId, toolCall) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            toolCalls: [...agent.toolCalls, toolCall],
          },
        },
      };
    });
  },

  updateToolResult: (agentId, toolId, result, success) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      const toolCalls = agent.toolCalls.map((tc) => {
        if (tc.id === toolId || (!toolId && tc.result === undefined)) {
          return { ...tc, result, success };
        }
        return tc;
      });

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            toolCalls,
          },
        },
      };
    });
  },

  setError: (message) => {
    set({ error: message });
  },

  setComplete: (isComplete) => {
    const currentState = get();

    // When coordination completes, mark all agents as 'completed'
    if (isComplete) {
      const updatedAgents = Object.fromEntries(
        Object.entries(currentState.agents).map(([id, agent]) => [
          id,
          { ...agent, status: 'completed' as AgentStatus },
        ])
      );
      set({ isComplete, agents: updatedAgents });

      // Fetch the clean final answer when coordination completes
      // This is the right time because the answer file has been written to disk
      // The transition to finalComplete will happen AFTER the answer is fetched
      if (currentState.selectedAgent) {
        get().fetchCleanFinalAnswer();
      }
    } else {
      set({ isComplete });
    }
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
  },

  backToCoordination: () => {
    set({ viewMode: 'coordination' });
  },

  fetchCleanFinalAnswer: async () => {
    const state = get();
    if (!state.sessionId) return;

    try {
      const response = await fetch(`/api/sessions/${state.sessionId}/final-answer`);
      if (response.ok) {
        const data = await response.json();
        if (data.answer) {
          // Update the final answer with the clean version
          set({ finalAnswer: data.answer });

          // Also update the answer in the answers array
          const selectedAgent = state.selectedAgent;
          if (selectedAgent) {
            set((s) => ({
              answers: s.answers.map((a) =>
                a.agentId === selectedAgent && a.answerNumber === 0
                  ? { ...a, content: data.answer }
                  : a
              ),
            }));
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch clean final answer:', err);
    }

    // ALWAYS transition to finalComplete when coordination is done
    // Even if the API call failed, we have the streamed content
    set({ viewMode: 'finalComplete' });
  },

  startNewRound: (agentId, roundType, customLabel) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      const agentIndex = state.agentOrder.indexOf(agentId) + 1;

      // Calculate the answer number for the PREVIOUS round (it's getting closed/completed)
      // Count existing labeled answer rounds (not "current")
      const existingAnswerRounds = agent.rounds.filter(
        r => r.type === 'answer' && r.label !== 'current'
      ).length;
      const previousAnswerNumber = existingAnswerRounds + 1;

      // Generate label for the PREVIOUS round (the completed answer)
      // Always use proper answer label format for the previous round
      const previousRoundLabel = `answer${agentIndex}.${previousAnswerNumber}`;

      // Close previous round and rename it from "current" to the proper label
      const now = Date.now();
      const newRoundId = `${agentId}-round-${agent.rounds.length}`;

      const updatedRounds = agent.rounds.map((round) => {
        if (round.id === agent.currentRoundId && !round.endTimestamp) {
          // Close/finalize the previous round
          // - If it's labeled "current", rename to proper answer label (e.g., "answer2.1")
          // - If it already has a label (e.g., "vote3.1"), keep that label
          // - For final rounds, we're just closing the previous round, not renaming it
          const newLabel = round.label === 'current' ? previousRoundLabel : round.label;
          return { ...round, endTimestamp: now, label: newLabel };
        }
        return round;
      });

      // Determine the new round's label
      // - If customLabel is 'final', this is the final round
      // - Otherwise it's "current" (active/in-progress work)
      const newRoundLabel = customLabel === 'final' ? 'final' : 'current';

      // Calculate round number for the new round
      const newRoundNumber = roundType === 'answer'
        ? previousAnswerNumber + 1
        : agent.rounds.filter(r => r.type === roundType && r.label !== 'current').length + 1;

      // Create new round
      const newRound: AgentRound = {
        id: newRoundId,
        roundNumber: newRoundNumber,
        type: roundType,
        label: newRoundLabel,
        content: '',
        startTimestamp: now,
      };

      // Always display the new round - it's where new streaming content will go
      // For "final" rounds: winner will stream their final answer here
      // For other rounds: agent continues working, content streams here

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            rounds: [...updatedRounds, newRound],
            currentRoundId: newRoundId,           // New streaming goes here
            displayRoundId: newRoundId,           // Always show the current/active round
            currentContent: '',                   // Reset for new round
            voteCount: roundType === 'vote' ? agent.voteCount + 1 : agent.voteCount,
          },
        },
      };
    });
  },

  finalizeRoundWithLabel: (agentId, label, createNewRound = true) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      const now = Date.now();
      const currentRound = agent.rounds.find(r => r.id === agent.currentRoundId);

      // Close current round with the provided label
      const updatedRounds = agent.rounds.map((round) => {
        if (round.id === agent.currentRoundId && round.label === 'current') {
          return { ...round, endTimestamp: now, label: label };
        }
        return round;
      });

      // Store the previous round ID (the one we just labeled)
      const previousRoundId = agent.currentRoundId;

      // Optionally create new "current" round for future content
      if (createNewRound) {
        const newRoundId = `${agentId}-round-${agent.rounds.length}`;
        const newRound: AgentRound = {
          id: newRoundId,
          roundNumber: agent.rounds.length,
          type: 'answer',
          label: 'current',
          content: '',
          startTimestamp: now,
        };

        return {
          agents: {
            ...state.agents,
            [agentId]: {
              ...agent,
              rounds: [...updatedRounds, newRound],
              currentRoundId: newRoundId,
              displayRoundId: newRoundId,  // Show the NEW current round for live streaming
              currentContent: '',
            },
          },
        };
      }

      // Just finalize without creating new round
      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            rounds: updatedRounds,
            displayRoundId: previousRoundId,
            currentContent: currentRound?.content || '',
          },
        },
      };
    });
  },

  setAgentRound: (agentId, roundId) => {
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      const round = agent.rounds.find(r => r.id === roundId);
      if (!round) return state;

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            displayRoundId: roundId,      // User selects display round
            currentContent: round.content, // Show that round's content
          },
        },
      };
    });
  },

  reset: () => {
    set(initialState);
  },

  // Multi-turn conversation actions
  addToConversationHistory: (role, content) => {
    set((state) => ({
      conversationHistory: [
        ...state.conversationHistory,
        { role, content, turn: state.turnNumber },
      ],
    }));
  },

  startContinuation: (question) => {
    // Called when starting a follow-up question
    // Reset agent states but preserve conversation history and increment turn
    set((state) => {
      // Add the previous final answer to history before starting new turn
      const updatedHistory = state.finalAnswer
        ? [
            ...state.conversationHistory,
            { role: 'assistant' as const, content: state.finalAnswer, turn: state.turnNumber },
          ]
        : state.conversationHistory;

      // Add the new question to history
      const historyWithQuestion = [
        ...updatedHistory,
        { role: 'user' as const, content: question, turn: state.turnNumber + 1 },
      ];

      // Reset agent states for new coordination
      const resetAgents: Record<string, AgentState> = {};
      const resetAgentUIState: Record<string, AgentUIState> = {};
      state.agentOrder.forEach((id) => {
        const agent = state.agents[id];
        const initialRoundId = `${id}-round-0`;
        resetAgents[id] = {
          id,
          modelName: agent?.modelName,
          status: 'waiting',
          content: [],
          currentContent: '',
          rounds: [{
            id: initialRoundId,
            roundNumber: 0,
            type: 'answer',
            label: 'current',
            content: '',
            startTimestamp: Date.now(),
          }],
          currentRoundId: initialRoundId,
          displayRoundId: initialRoundId,
          answerCount: 0,
          voteCount: 0,
          files: [],
          toolCalls: [],
        };
        resetAgentUIState[id] = createAgentUIState();
      });

      return {
        question,
        agents: resetAgents,
        answers: [],
        voteDistribution: {},
        selectedAgent: undefined,
        finalAnswer: undefined,
        orchestratorEvents: [],
        isComplete: false,
        selectingWinner: false,
        error: undefined,
        viewMode: 'coordination',
        turnNumber: state.turnNumber + 1,
        conversationHistory: historyWithQuestion,
        agentUIState: resetAgentUIState,
      };
    });
  },

  // Per-agent UI state actions
  setAgentDropdownOpen: (agentId, open) => {
    set((state) => ({
      agentUIState: {
        ...state.agentUIState,
        [agentId]: {
          ...(state.agentUIState[agentId] || createAgentUIState()),
          dropdownOpen: open,
        },
      },
    }));
  },

  closeAllDropdowns: () => {
    set((state) => {
      const updated: Record<string, AgentUIState> = {};
      Object.entries(state.agentUIState).forEach(([id, ui]) => {
        updated[id] = { ...ui, dropdownOpen: false };
      });
      return { agentUIState: updated };
    });
  },

  setPreparationStatus: (status, detail) => {
    set({ preparationStatus: status, preparationDetail: detail });
  },

  // Process WebSocket events
  processWSEvent: (event) => {
    const store = get();

    switch (event.type) {
      case 'preparation_status':
        if ('status' in event) {
          store.setPreparationStatus(
            (event as { status: string }).status,
            'detail' in event ? (event as { detail?: string }).detail : undefined
          );
          // When the server auto-starts a run (e.g. `massgen --web "question"`),
          // the preparation_status carries the question so the frontend can show
          // the launch sequence immediately.
          if ('question' in event && !get().question) {
            const q = (event as { question: string }).question;
            set({
              question: q,
              initStatus: { message: 'Submitting prompt...', step: 'request', progress: 3 },
              conversationHistory: [{ role: 'user' as const, content: q, turn: 1 }],
              turnNumber: 1,
            });
          }
        }
        break;

      case 'init':
        // Only clear preparation status when agents are actually ready
        if ('agents' in event && 'question' in event) {
          // Clear init status when actual coordination starts
          set({ initStatus: undefined });
          store.setPreparationStatus(undefined, undefined);
          // Set automation mode if provided
          if ('automation_mode' in event) {
            set({ automationMode: (event as { automation_mode: boolean }).automation_mode });
          }
          if ('log_dir' in event) {
            set({ logDir: (event as { log_dir: string }).log_dir });
          }
          store.initSession(
            event.session_id,
            event.question,
            event.agents,
            'theme' in event ? event.theme : 'dark',
            'agent_models' in event ? (event as { agent_models: Record<string, string> }).agent_models : undefined
          );
        } else if ('automation_mode' in event) {
          // Handle init without agents (just automation_mode flag)
          set({ automationMode: (event as { automation_mode: boolean }).automation_mode });
        }
        break;

      // Handle structured_event for checkpoint_activated (dynamic agent registration)
      // Note: pre-collab events are handled by messageStore -> preCollabStore only
      case 'structured_event' as string: {
        const se = event as unknown as {
          event_type: string;
          data: Record<string, unknown>;
        };
        if (se.event_type === 'checkpoint_activated') {
          const participants = (se.data.participants as Record<string, { real_agent_id: string; model: string }>) || {};
          const currentAgents = { ...get().agents };
          const currentOrder = [...get().agentOrder];
          const currentUIState = { ...get().agentUIState };

          for (const [displayId, info] of Object.entries(participants)) {
            if (!currentAgents[displayId]) {
              currentAgents[displayId] = createAgentState(displayId, info.model || undefined);
              currentUIState[displayId] = createAgentUIState();
              if (!currentOrder.includes(displayId)) {
                // Insert after real agent in order
                const realIdx = currentOrder.indexOf(info.real_agent_id);
                if (realIdx >= 0) {
                  currentOrder.splice(realIdx + 1, 0, displayId);
                } else {
                  currentOrder.push(displayId);
                }
              }
            }
          }

          // Mark the main agent as "completed" so it stops showing "Generating"
          const mainAgentId = (se.data.main_agent_id as string) || '';
          if (mainAgentId && currentAgents[mainAgentId]) {
            currentAgents[mainAgentId] = {
              ...currentAgents[mainAgentId],
              status: 'completed' as AgentStatus,
            };
          }

          set({ agents: currentAgents, agentOrder: currentOrder, agentUIState: currentUIState });
        }
        break;
      }

      case 'agent_content':
        if ('agent_id' in event && 'content' in event) {
          store.updateAgentContent(
            event.agent_id,
            event.content,
            'content_type' in event ? event.content_type : 'thinking'
          );
          // Note: We intentionally don't do early transition here.
          // Let the "Selecting Winner" overlay show until consensus_reached arrives.
          // The content is accumulating in the current round and will be preserved
          // when setConsensus renames it to 'final'.
        }
        break;

      case 'agent_status':
        if ('agent_id' in event && 'status' in event) {
          store.updateAgentStatus(event.agent_id, event.status as AgentStatus);
        }
        break;

      case 'orchestrator_event':
        if ('event' in event) {
          store.addOrchestratorEvent(event.event);
        }
        break;

      case 'vote_cast':
        if ('voter_id' in event && 'target_id' in event) {
          // Get the agent to calculate vote number and agent index for label
          const votingAgent = get().agents[event.voter_id];
          const voteNumber = votingAgent ? votingAgent.voteCount + 1 : 1;
          const agentIndex = get().agentOrder.indexOf(event.voter_id) + 1;


          // Format vote label like answers: vote{agentIndex}.{voteNumber}
          const voteLabel = `vote${agentIndex}.${voteNumber}`;

          // Finalize current round as a vote round - don't create new round since voting is done
          store.finalizeRoundWithLabel(event.voter_id, voteLabel, false);

          store.recordVote(
            event.voter_id,
            event.target_id,
            'reason' in event ? event.reason : ''
          );

          // Show notification for vote
          const voterAgent = get().agents[event.voter_id];
          const targetAgent = get().agents[event.target_id];
          const targetName = targetAgent?.modelName
            ? `${event.target_id} (${targetAgent.modelName})`
            : event.target_id;
          useNotificationStore.getState().addNotification({
            type: 'vote',
            title: `${event.voter_id} voted`,
            message: `Voted for ${targetName}`,
            agentId: event.voter_id,
            modelName: voterAgent?.modelName,
          });
        }
        break;

      case 'vote_distribution':
        // NOTE: Ignoring vote_distribution events from backend as they may contain
        // cumulative votes from all rounds. We rely on recordVote instead which
        // has round-reset logic to only track the current round's votes.
        // if ('votes' in event) {
        //   store.updateVoteDistribution(event.votes);
        // }
        break;

      case 'consensus_reached':
        if ('winner_id' in event) {
          store.setConsensus(event.winner_id);
        }
        break;

      case 'final_answer':
        if ('answer' in event) {
          store.setFinalAnswer(
            event.answer,
            'vote_results' in event ? event.vote_results : {},
            'selected_agent' in event ? event.selected_agent : ''
          );
        }
        break;

      case 'new_answer':
        if ('agent_id' in event && 'content' in event) {
          const newAnswerEvent = event as {
            agent_id: string;
            content: string;
            answer_id?: string;
            answer_number?: number;
            answer_label?: string;  // e.g., "agent2.1" from backend
            workspace_path?: string;  // Absolute path to workspace snapshot
            timestamp: number;
          };

          // Check if this agent has already voted - if so, this is the "final" answer
          // which will be handled by consensus_reached, so skip creating a new round
          const agentState = get().agents[newAnswerEvent.agent_id];
          if (agentState && agentState.voteCount > 0) {
            break;
          }

          // IMPORTANT: When a new answer is submitted, increment the voting round and reset
          // vote distribution. Previous votes remain in voteHistory (for history display) but
          // are now invalidated since they were cast in an earlier round.
          // Also reset all agents with "completed" status back to "working" since they need
          // to vote again on the new set of answers.
          // Additionally, start new "current" rounds for agents whose current round was a vote
          // (their displayRoundId was showing "vote1.1" which should now show "current").
          set((state) => {
            const updatedAgents = { ...state.agents };
            const now = Date.now();

            state.agentOrder.forEach(id => {
              const agent = updatedAgents[id];
              if (!agent) return;

              // Check if this agent's current round is a vote round (not "current")
              const currentRound = agent.rounds.find(r => r.id === agent.currentRoundId);
              const needsNewRound = currentRound && currentRound.label !== 'current' && currentRound.type === 'vote';

              if (needsNewRound || agent.status === 'completed') {
                // Create a new "current" round for agents who had voted
                const newRoundId = needsNewRound ? `${id}-round-${agent.rounds.length}` : agent.currentRoundId;
                const newRounds = needsNewRound ? [
                  ...agent.rounds,
                  {
                    id: newRoundId,
                    roundNumber: agent.rounds.length,
                    type: 'answer' as const,
                    label: 'current',
                    content: '',
                    startTimestamp: now,
                  },
                ] : agent.rounds;

                updatedAgents[id] = {
                  ...agent,
                  status: 'working',
                  rounds: newRounds,
                  currentRoundId: newRoundId,
                  displayRoundId: newRoundId,  // Show the new "current" round
                  currentContent: '',          // Reset content for new round
                };
              }
            });
            return {
              agents: updatedAgents,
              currentVotingRound: state.currentVotingRound + 1,
              voteDistribution: {},
              selectingWinner: false,
            };
          });

          // Get the agent index for generating label if not provided
          const agentIndex = get().agentOrder.indexOf(newAnswerEvent.agent_id) + 1;
          const answerNumber = newAnswerEvent.answer_number ?? 1;

          // Use backend label if provided, otherwise generate one
          const answerLabel = newAnswerEvent.answer_label
            || `answer${agentIndex}.${answerNumber}`;

          // Finalize the current round with the proper answer label
          store.finalizeRoundWithLabel(newAnswerEvent.agent_id, answerLabel);

          store.addAnswer({
            id: newAnswerEvent.answer_id ?? `${newAnswerEvent.agent_id}-${Date.now()}`,
            agentId: newAnswerEvent.agent_id,
            answerNumber: answerNumber,
            content: newAnswerEvent.content,
            // Server sends timestamp in seconds, JavaScript Date expects milliseconds
            timestamp: newAnswerEvent.timestamp < 1e12 ? newAnswerEvent.timestamp * 1000 : newAnswerEvent.timestamp,
            votes: 0,
            workspacePath: newAnswerEvent.workspace_path,
          });

          // Add historical snapshot to workspace store for this answer
          if (newAnswerEvent.workspace_path) {
            const timestamp = newAnswerEvent.timestamp < 1e12
              ? newAnswerEvent.timestamp * 1000
              : newAnswerEvent.timestamp;
            useWorkspaceStore.getState().addHistoricalSnapshot(
              answerLabel,
              newAnswerEvent.workspace_path,
              timestamp
            );
          }

          // Show notification for new answer
          const agent = get().agents[newAnswerEvent.agent_id];
          const contentPreview = newAnswerEvent.content.slice(0, 100) + (newAnswerEvent.content.length > 100 ? '...' : '');
          const answerId = newAnswerEvent.answer_id ?? `${newAnswerEvent.agent_id}-${Date.now()}`;
          useNotificationStore.getState().addNotification({
            type: 'answer',
            title: `New Answer from ${newAnswerEvent.agent_id}`,
            message: contentPreview,
            agentId: newAnswerEvent.agent_id,
            modelName: agent?.modelName,
            answerId,
          });
        }
        break;

      case 'restart':
        // When an agent restarts, start a new answer round
        if ('reason' in event) {
          // The restart affects all agents - start new rounds for each
          const agentOrder = get().agentOrder;
          agentOrder.forEach((agentId) => {
            store.startNewRound(agentId, 'answer');
          });
        }
        break;

      case 'file_change':
        if ('agent_id' in event && 'path' in event) {
          store.addFileChange(event.agent_id, {
            path: event.path,
            operation: 'operation' in event ? event.operation : 'create',
            // Server sends timestamp in seconds, JavaScript Date expects milliseconds
            timestamp: event.timestamp < 1e12 ? event.timestamp * 1000 : event.timestamp,
            contentPreview: 'content_preview' in event ? event.content_preview : undefined,
          });
        }
        break;

      case 'tool_call':
        if ('agent_id' in event && 'tool_name' in event) {
          store.addToolCall(event.agent_id, {
            id: 'tool_id' in event ? event.tool_id : undefined,
            name: event.tool_name,
            args: 'tool_args' in event ? event.tool_args : {},
            // Server sends timestamp in seconds, JavaScript Date expects milliseconds
            timestamp: event.timestamp < 1e12 ? event.timestamp * 1000 : event.timestamp,
          });
        }
        break;

      case 'tool_result':
        if ('agent_id' in event && 'result' in event) {
          store.updateToolResult(
            event.agent_id,
            'tool_id' in event ? event.tool_id : undefined,
            event.result,
            'success' in event ? event.success : true
          );
        }
        break;

      case 'timeout_status':
        // Update per-agent timeout state
        if ('agent_id' in event && 'timeout_state' in event) {
          set((state) => {
            const agent = state.agents[event.agent_id];
            if (!agent) return state;
            return {
              agents: {
                ...state.agents,
                [event.agent_id]: {
                  ...agent,
                  timeoutState: event.timeout_state,
                },
              },
            };
          });
        }
        break;

      case 'hook_execution':
        // Attach hook execution info to tool calls
        if ('agent_id' in event && 'hook_info' in event) {
          const hookEvent = event as {
            agent_id: string;
            tool_call_id?: string;
            hook_info: {
              hook_name: string;
              hook_type: 'pre' | 'post';
              decision: 'allow' | 'deny' | 'error';
              reason?: string;
              execution_time_ms?: number;
              injection_preview?: string;
            };
          };
          set((state) => {
            const agent = state.agents[hookEvent.agent_id];
            if (!agent || !agent.toolCalls.length) return state;

            // Find the tool call to attach the hook to
            const toolCalls = [...agent.toolCalls];
            let targetIndex = -1;

            if (hookEvent.tool_call_id) {
              targetIndex = toolCalls.findIndex(tc => tc.id === hookEvent.tool_call_id);
            }
            // If no specific tool_id, attach to the most recent tool
            if (targetIndex === -1) {
              targetIndex = toolCalls.length - 1;
            }

            if (targetIndex >= 0) {
              const toolCall = { ...toolCalls[targetIndex] };
              if (hookEvent.hook_info.hook_type === 'pre') {
                toolCall.preHooks = [...(toolCall.preHooks || []), hookEvent.hook_info];
              } else {
                toolCall.postHooks = [...(toolCall.postHooks || []), hookEvent.hook_info];
              }
              toolCalls[targetIndex] = toolCall;
            }

            return {
              agents: {
                ...state.agents,
                [hookEvent.agent_id]: {
                  ...agent,
                  toolCalls,
                },
              },
            };
          });
        }
        break;

      case 'error':
        if ('message' in event) {
          store.setError(event.message);
        }
        break;

      case 'done':
      case 'coordination_complete':
        store.setComplete(true);
        // Clear init status when coordination completes
        set({ initStatus: undefined });
        break;

      case 'init_status':
        // Initialization status updates (config loading, agent setup, etc.)
        if ('message' in event && 'step' in event && 'progress' in event) {
          set({
            initStatus: {
              message: event.message,
              step: event.step,
              progress: event.progress,
            },
          });
        }
        break;

      case 'state_snapshot':
        // Handle full state snapshot for late-joining clients or session switching
        if ('agents' in event && Array.isArray(event.agents)) {
          // Type the snapshot with all fields
          const snapshot = event as {
            session_id: string;
            question?: string;
            agents: string[];
            agent_models?: Record<string, string>;
            theme?: string;
            final_answer?: string;
            selected_agent?: string;
            vote_distribution?: Record<string, number>;
            vote_targets?: Record<string, string>;
            agent_status?: Record<string, string>;
            agent_outputs?: Record<string, string[]>;
            automation_mode?: boolean;
            log_dir?: string;
          };

          // Set automation mode if provided
          if (snapshot.automation_mode !== undefined) {
            set({ automationMode: snapshot.automation_mode });
          }
          if (snapshot.log_dir) {
            set({ logDir: snapshot.log_dir });
          }

          // Initialize session with agent_models
          store.initSession(
            snapshot.session_id,
            snapshot.question || '',
            snapshot.agents,
            snapshot.theme || 'dark',
            snapshot.agent_models
          );

          // Restore agent statuses - but only if the agent has produced output.
          // This prevents stale "completed" status from a previous session when
          // the new session hasn't started yet (agent_outputs would be empty).
          if (snapshot.agent_status && snapshot.agent_outputs) {
            Object.entries(snapshot.agent_status).forEach(([agentId, status]) => {
              // Only restore non-waiting status if agent has output (proves they actually worked)
              const agentOutputs = snapshot.agent_outputs?.[agentId];
              const hasOutput = agentOutputs && agentOutputs.length > 0 && agentOutputs.some(o => o.length > 0);
              if (status === 'waiting' || hasOutput) {
                store.updateAgentStatus(agentId, status as AgentStatus);
              }
              // If status is "completed" but no output, keep the default "waiting" from initSession
            });
          }

          // Restore agent content from agent_outputs
          if (snapshot.agent_outputs) {
            set((state) => {
              const updatedAgents = { ...state.agents };
              Object.entries(snapshot.agent_outputs!).forEach(([agentId, outputs]) => {
                if (updatedAgents[agentId]) {
                  const content = outputs.join('');
                  // Update the current round with restored content
                  const updatedRounds = updatedAgents[agentId].rounds.map((round, idx) =>
                    idx === 0 ? { ...round, content } : round
                  );
                  updatedAgents[agentId] = {
                    ...updatedAgents[agentId],
                    rounds: updatedRounds,
                  };
                }
              });
              return { agents: updatedAgents };
            });
          }

          // Restore vote distribution
          if (snapshot.vote_distribution) {
            store.updateVoteDistribution(snapshot.vote_distribution);
          }

          // Restore vote targets for UI state only (don't call recordVote as that would
          // double-count votes since updateVoteDistribution already set the distribution)
          if (snapshot.vote_targets) {
            set((state) => {
              const updatedAgents = { ...state.agents };
              Object.entries(snapshot.vote_targets!).forEach(([voterId, targetId]) => {
                if (updatedAgents[voterId]) {
                  updatedAgents[voterId] = {
                    ...updatedAgents[voterId],
                    voteTarget: targetId as string,
                  };
                }
              });
              return { agents: updatedAgents };
            });
          }

          // Restore final answer and mark as complete
          if (snapshot.final_answer && snapshot.selected_agent) {
            // Set flag to skip animation when restoring
            set({ restoredFromSnapshot: true });
            store.setFinalAnswer(snapshot.final_answer, {}, snapshot.selected_agent);
            store.setComplete(true);
          } else if (snapshot.selected_agent) {
            // If we have a selected agent but no final answer yet,
            // fetch the final answer from the API (it may have been saved to disk)
            set({ restoredFromSnapshot: true });
            // Capture session ID to check for staleness when response arrives
            const fetchSessionId = snapshot.session_id;
            const fetchSelectedAgent = snapshot.selected_agent;
            fetch(`/api/sessions/${fetchSessionId}/final-answer`)
              .then(res => res.json())
              .then(data => {
                // Check if we're still on the same session before updating state
                const currentState = get();
                if (currentState.sessionId !== fetchSessionId) {
                  // Session changed while fetch was in-flight, ignore stale response
                  return;
                }
                if (data.answer) {
                  store.setFinalAnswer(data.answer, {}, fetchSelectedAgent);
                  store.setComplete(true);
                }
              })
              .catch(() => {
                // Final answer not available yet, that's okay
              });
          }
        }
        break;

      default:
        // Ignore unknown events (like keepalive)
        break;
    }
  },
}));

// Selectors
export const selectAgents = (state: AgentStore) => state.agents;
export const selectAgentOrder = (state: AgentStore) => state.agentOrder;
export const selectAnswers = (state: AgentStore) => state.answers;
export const selectVoteDistribution = (state: AgentStore) => state.voteDistribution;
export const selectVoteHistory = (state: AgentStore) => state.voteHistory;
export const selectCurrentVotingRound = (state: AgentStore) => state.currentVotingRound;
export const selectSelectedAgent = (state: AgentStore) => state.selectedAgent;
export const selectFinalAnswer = (state: AgentStore) => state.finalAnswer;
export const selectIsComplete = (state: AgentStore) => state.isComplete;
export const selectQuestion = (state: AgentStore) => state.question;
export const selectOrchestratorEvents = (state: AgentStore) => state.orchestratorEvents;
export const selectViewMode = (state: AgentStore) => state.viewMode;
export const selectSelectingWinner = (state: AgentStore) => state.selectingWinner;
export const selectRestoredFromSnapshot = (state: AgentStore) => state.restoredFromSnapshot;
export const selectAutomationMode = (state: AgentStore) => state.automationMode;
export const selectLogDir = (state: AgentStore) => state.logDir;
export const selectInitStatus = (state: AgentStore) => state.initStatus;
export const selectPreparationStatus = (state: AgentStore) => state.preparationStatus;
export const selectPreparationDetail = (state: AgentStore) => state.preparationDetail;

/**
 * Clean streaming content by removing tool/MCP noise that shouldn't appear in final answers.
 * This handles cases where the streaming content includes status messages like:
 * - MCP connection messages (✅ [MCP] Connected, 🔧 [MCP] 27 tools)
 * - Tool call markers
 * - Status emojis that indicate system messages
 */
function cleanStreamedContent(content: string): string {
  if (!content) return content;

  // Split into lines and filter out noise
  const lines = content.split('\n');
  const cleanedLines = lines.filter(line => {
    const trimmed = line.trim();
    // Filter out MCP connection/tool messages
    if (trimmed.includes('[MCP]')) return false;
    if (trimmed.startsWith('✅ [MCP]') || trimmed.startsWith('🔧 [MCP]')) return false;
    // Filter out tool availability messages
    if (trimmed.match(/^\d+ tools? available$/)) return false;
    if (trimmed.match(/^Connected to \d+ servers?$/)) return false;
    return true;
  });

  // Also clean inline MCP messages that might be on the same line as content
  let result = cleanedLines.join('\n');
  // Remove inline MCP messages like "...text✅ [MCP] Connected to 3 servers🔧 [MCP] 27 tools available"
  result = result.replace(/✅\s*\[MCP\][^🔧\n]*(?:🔧\s*\[MCP\][^\n]*)?/g, '');
  result = result.replace(/🔧\s*\[MCP\][^\n]*/g, '');

  return result.trim();
}

/**
 * Get the RESOLVED final answer content.
 * The finalAnswer field may be '__PENDING__' because the final_answer event arrives
 * before streaming completes. This selector gets the actual content from the
 * winner agent's "final" round.
 *
 * NOTE: This returns a primitive string, so it's safe from infinite re-render loops.
 */
export const selectResolvedFinalAnswer = (state: AgentStore): string | undefined => {
  // If we have a clean finalAnswer from the API, use it
  if (state.finalAnswer && state.finalAnswer !== '__PENDING__') {
    return state.finalAnswer;
  }

  if (!state.selectedAgent) return state.finalAnswer;

  const winner = state.agents[state.selectedAgent];
  if (!winner) return state.finalAnswer;

  // Get content from the "final" round and clean it
  const finalRound = winner.rounds.find(r => r.label === 'final');
  if (finalRound?.content) {
    return cleanStreamedContent(finalRound.content);
  }

  // Fall back to current content if no final round
  if (winner.currentContent) {
    return cleanStreamedContent(winner.currentContent);
  }

  // Last resort: return whatever is in finalAnswer (might be __PENDING__)
  return state.finalAnswer;
};

/**
 * Helper to resolve a single answer's content if it's a pending final answer.
 * Used by components to resolve content on-demand rather than in selectors.
 *
 * @param answer - The answer to resolve
 * @param agents - Agent states (for fallback to round content)
 * @param storeFinalAnswer - The finalAnswer from the store (fetched from API)
 */
export function resolveAnswerContent(
  answer: Answer,
  agents: Record<string, AgentState>,
  storeFinalAnswer?: string
): string {
  if (answer.content === '__PENDING__' && answer.answerNumber === 0) {
    // First try: use the clean final answer from the store (fetched from API)
    if (storeFinalAnswer && storeFinalAnswer !== '__PENDING__') {
      return storeFinalAnswer;
    }

    // Fallback: try to get from agent's final round
    const agent = agents[answer.agentId];
    if (agent) {
      const finalRound = agent.rounds.find(r => r.label === 'final');
      if (finalRound?.content) {
        return finalRound.content;
      }
      if (agent.currentContent) {
        return agent.currentContent;
      }
    }
  }
  return answer.content;
}
