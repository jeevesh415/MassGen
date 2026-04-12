import { useState, useEffect, useRef } from 'react';
import { cn } from '../../../lib/utils';
import { useAgentStore } from '../../../stores/agentStore';
import { useMessageStore } from '../../../stores/v2/messageStore';
import { useThemeStore } from '../../../stores/themeStore';
import { useTileStore } from '../../../stores/v2/tileStore';
import { useWizardStore } from '../../../stores/wizardStore';
import { useSetupStore } from '../../../stores/setupStore';
import { useOnboardingStore } from '../../../stores/v2/onboardingStore';
import { useV2KeyboardShortcuts } from '../../../hooks/useV2KeyboardShortcuts';
import type { ConnectionStatus } from '../../../hooks/useWebSocket';
import { useModeStore } from '../../../stores/v2/modeStore';
import { useStatusStore } from '../../../stores/v2/statusStore';
import { useWorkspaceModalStore } from '../../../stores/v2/workspaceModalStore';
import { usePreCollabStore } from '../../../stores/v2/preCollabStore';
import { Sidebar } from '../sidebar/Sidebar';
import { TileContainer } from '../tiles/TileContainer';
import { GlobalInputBar } from './GlobalInputBar';
import { ModeConfigBar } from './ModeConfigBar';
import { V2QuickstartWizard } from './V2QuickstartWizard';
import { V2SetupOverlay } from './V2SetupOverlay';
import { LaunchIndicator } from './LaunchIndicator';
import { PromptBanner } from '../tiles/PromptBanner';
import { PreCollabResultsPanel } from './PreCollabResultsPanel';
import { ReviewModal } from './ReviewModal';
import { WorkspaceModal } from './WorkspaceModal';
import { WorkspaceBrowserTile } from '../tiles/WorkspaceBrowserTile';
import { AnswerBrowserTile } from '../tiles/AnswerBrowserTile';
import { TimelineTile } from '../tiles/TimelineTile';

interface AppShellProps {
  wsStatus: ConnectionStatus;
  startCoordination: (question: string, configPath?: string) => void;
  continueConversation: (question: string) => void;
  cancelCoordination?: () => void;
  selectedConfig: string | null;
  onConfigChange: (configPath: string) => void;
  onSessionChange?: (sessionId: string) => void;
  onNewSession?: () => void;
  broadcastMessage?: (message: string, targets: string[] | null) => void;
}

export function AppShell({
  wsStatus,
  startCoordination,
  continueConversation,
  cancelCoordination,
  selectedConfig,
  onConfigChange,
  onSessionChange,
  onNewSession,
  broadcastMessage,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [configRefreshTrigger, setConfigRefreshTrigger] = useState(0);

  // Wizard state
  const isWizardOpen = useWizardStore((s) => s.isOpen);
  const openWizard = useWizardStore((s) => s.openWizard);

  // Setup overlay state
  const isSetupOpen = useSetupStore((s) => s.isOpen);
  const openSetup = useSetupStore((s) => s.openSetup);

  // Restore custom config state on mount
  const restoreState = useModeStore((s) => s.restoreState);
  const needsFirstTimeSetup = useModeStore((s) => s.needsFirstTimeSetup);
  const customConfigPath = useModeStore((s) => s.customConfigPath);
  const [firstTimeDrawerOpened, setFirstTimeDrawerOpened] = useState(false);

  useEffect(() => {
    restoreState();
  }, [restoreState]);

  // When restoreState resolves and custom config exists, auto-select it
  useEffect(() => {
    if (customConfigPath && !selectedConfig) {
      onConfigChange(customConfigPath);
    }
  }, [customConfigPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if first-time setup is needed, or if wizard/setup URL params are set
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('setup') === 'open') {
      openSetup();
      return;
    }
    if (urlParams.get('wizard') === 'open') {
      const isSkillOnboarding = urlParams.get('skill') === '1';
      if (isSkillOnboarding) {
        useOnboardingStore.getState().initFromUrl();
      }
      openWizard(isSkillOnboarding);
      return;
    }

    fetch('/api/setup/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.needs_setup) {
          openSetup();
        }
      })
      .catch(() => {});
  }, [openWizard, openSetup]);

  // First-time setup: auto-set agent count and signal ModeConfigBar to open drawer
  useEffect(() => {
    if (needsFirstTimeSetup && !firstTimeDrawerOpened) {
      const urlParams = new URLSearchParams(window.location.search);
      // Don't auto-open if a CLI config was passed
      if (!urlParams.get('config')) {
        useModeStore.getState().setAgentCount(3);
        setFirstTimeDrawerOpened(true);
      }
    }
  }, [needsFirstTimeSetup, firstTimeDrawerOpened]);

  // Determine temporary mode from URL
  const initialTemporaryQuickstart = new URLSearchParams(window.location.search).get('temporary') === '1';

  const handleWizardConfigSaved = (configPath: string) => {
    onConfigChange(configPath);
    setConfigRefreshTrigger((n) => n + 1);
  };

  // Keyboard shortcuts
  useV2KeyboardShortcuts();

  // Theme sync
  const getEffectiveTheme = useThemeStore((s) => s.getEffectiveTheme);
  const themeMode = useThemeStore((s) => s.mode);

  useEffect(() => {
    const effectiveTheme = getEffectiveTheme();
    const root = document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [getEffectiveTheme, themeMode]);

  // Auto-select first agent channel when agents initialize
  const agentOrder = useAgentStore((s) => s.agentOrder);
  const tiles = useTileStore((s) => s.tiles);
  const setTile = useTileStore((s) => s.setTile);
  const prevAgentCountRef = useRef(0);

  useEffect(() => {
    // When agents first appear and no tile is open, auto-open the first agent
    if (agentOrder.length > 0 && prevAgentCountRef.current === 0 && tiles.length === 0) {
      const firstAgent = agentOrder[0];
      const agents = useAgentStore.getState().agents;
      setTile({
        id: `channel-${firstAgent}`,
        type: 'agent-channel',
        targetId: firstAgent,
        label: agents[firstAgent]?.modelName || firstAgent,
      });
    }
    prevAgentCountRef.current = agentOrder.length;
  }, [agentOrder, tiles.length, setTile]);

  const question = useAgentStore((s) => s.question);
  const isComplete = useAgentStore((s) => s.isComplete);
  const hasRenderableActivity = useMessageStore((s) =>
    Object.values(s.messages).some((agentMessages) =>
      agentMessages.some((message) => message.type !== 'round-divider')
    )
  );

  // Pre-collab phase tracking
  const preCollabIsActive = usePreCollabStore((s) => s.isActive);

  // Keep the launch sequence visible until the first meaningful agent activity arrives.
  // When pre-collab is active, skip the full-screen LaunchIndicator — the sidebar
  // PreCollabSection provides the primary pre-collab UI and users can open subagent tiles.
  const isLaunching = !!question && !isComplete && !hasRenderableActivity && !preCollabIsActive;

  // Lock/unlock mode bar during coordination execution
  const isRunning = !!question && !isComplete;
  const prevIsRunningRef = useRef(false);
  useEffect(() => {
    if (isRunning && !prevIsRunningRef.current) {
      useModeStore.getState().lock();
    } else if (!isRunning && prevIsRunningRef.current) {
      useModeStore.getState().unlock();
    }
    prevIsRunningRef.current = isRunning;
  }, [isRunning]);

  // Status polling for cost/timing metrics
  const sessionId = useAgentStore((s) => s.sessionId);
  useEffect(() => {
    if (sessionId && !isComplete) {
      useStatusStore.getState().startPolling(sessionId);
    } else if (isComplete && sessionId) {
      // Final fetch then stop
      useStatusStore.getState().fetchOnce(sessionId).then(() => {
        useStatusStore.getState().stopPolling();
      });
    }
    return () => {
      useStatusStore.getState().stopPolling();
    };
  }, [sessionId, isComplete]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-v2-main text-v2-text font-sans">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onSessionChange={onSessionChange}
        onNewSession={onNewSession}
        onConfigChange={onConfigChange}
      />

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Prompt banner — shows the question sent to agents */}
        <PromptBanner />

        {/* Crossfade the launch sequence into the tile view instead of hard-swapping */}
        <div className="relative flex-1 min-h-0">
          <div
            data-testid="launch-layer"
            className={cn(
              'absolute inset-0 flex transition-opacity duration-300',
              isLaunching ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}
          >
            <LaunchIndicator
              configName={selectedConfig?.split('/').pop()?.replace('.yaml', '') || undefined}
            />
          </div>
          <div
            data-testid="tiles-layer"
            className={cn(
              'absolute inset-0 transition-opacity duration-300',
              isLaunching ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            <TileContainer />
          </div>
        </div>

        {/* Mode configuration bar */}
        <ModeConfigBar configPath={selectedConfig ?? undefined} />

        {/* Global input bar — start session or broadcast */}
        <GlobalInputBar
          wsStatus={wsStatus}
          startCoordination={startCoordination}
          continueConversation={continueConversation}
          cancelCoordination={cancelCoordination}
          onNewSession={onNewSession}
          selectedConfig={selectedConfig}
          onConfigChange={onConfigChange}
          hasActiveSession={!!question}
          isComplete={isComplete}
          isLaunching={isLaunching}
          broadcastMessage={broadcastMessage}
          refreshTrigger={configRefreshTrigger}
        />
      </div>

      {/* Pre-Collab Results Panel */}
      <PreCollabResultsPanel />

      {/* Review Modal (full-screen overlay for git diff review) */}
      <ReviewModal />

      {/* Workspace Modal (full-screen overlays for Browse Files, Answers/Votes, Timeline) */}
      <WorkspaceModalRenderer />

      {/* V2 Setup Overlay */}
      {isSetupOpen && <V2SetupOverlay />}

      {/* V2 Quickstart Wizard */}
      {isWizardOpen && (
        <V2QuickstartWizard
          onConfigSaved={handleWizardConfigSaved}
          temporaryMode={initialTemporaryQuickstart}
        />
      )}

    </div>
  );
}

// ============================================================================
// Workspace Modal Renderer
// ============================================================================

const MODAL_TITLES: Record<string, string> = {
  files: 'Browse Files',
  answers: 'Answers / Votes',
  timeline: 'Timeline',
};

function WorkspaceModalRenderer() {
  const activeView = useWorkspaceModalStore((s) => s.activeView);
  const focusAnswerLabel = useWorkspaceModalStore((s) => s.focusAnswerLabel);
  const close = useWorkspaceModalStore((s) => s.close);

  if (!activeView) return null;

  return (
    <WorkspaceModal title={MODAL_TITLES[activeView] || ''} onClose={close}>
      {activeView === 'files' && <WorkspaceBrowserTile />}
      {activeView === 'answers' && <AnswerBrowserTile focusAnswerLabel={focusAnswerLabel || undefined} />}
      {activeView === 'timeline' && <TimelineTile />}
    </WorkspaceModal>
  );
}
