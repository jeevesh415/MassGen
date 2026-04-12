/**
 * Tests for V2QuickstartWizard overlay component
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { V2QuickstartWizard } from './V2QuickstartWizard';
import { useWizardStore } from '../../../stores/wizardStore';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Mock wizard step components
vi.mock('../../wizard', () => ({
  DockerStep: () => <div data-testid="docker-step">Docker Step</div>,
  ApiKeyStep: () => <div data-testid="apikey-step">API Key Step</div>,
  AgentCountStep: () => <div data-testid="agentcount-step">Agent Count Step</div>,
  SetupModeStep: () => <div data-testid="setupmode-step">Setup Mode Step</div>,
  AgentConfigStep: () => <div data-testid="agentconfig-step">Agent Config Step</div>,
  CoordinationStep: () => <div data-testid="coordination-step">Coordination Step</div>,
  SkillsStep: () => <div data-testid="skills-step">Skills Step</div>,
  PreviewStep: () => <div data-testid="preview-step">Preview Step</div>,
  WelcomeStep: () => <div data-testid="welcome-step">Welcome Step</div>,
}));

describe('V2QuickstartWizard', () => {
  beforeEach(() => {
    useWizardStore.setState({
      isOpen: true,
      currentStep: 'apiKeys',
      isLoading: false,
      error: null,
      skillOnboarding: false,
      providers: [{ id: 'openai', name: 'OpenAI', models: [], default_model: 'gpt-4', env_var: 'OPENAI_API_KEY', has_api_key: true, is_agent_framework: false, capabilities: [], notes: '' }],
      agentCount: 3,
      setupMode: 'different',
      agents: [],
      generatedConfig: null,
      generatedYaml: null,
      savedConfigPath: null,
    });
  });

  afterEach(() => {
    cleanup();
    useWizardStore.getState().reset();
  });

  it('renders when isOpen is true', () => {
    render(<V2QuickstartWizard />);
    expect(screen.getByText('Quickstart Setup')).toBeTruthy();
  });

  it('does not render when isOpen is false', () => {
    useWizardStore.setState({ isOpen: false });
    const { container } = render(<V2QuickstartWizard />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the apiKeys step by default', () => {
    render(<V2QuickstartWizard />);
    expect(screen.getByTestId('apikey-step')).toBeTruthy();
  });

  it('shows correct step title', () => {
    render(<V2QuickstartWizard />);
    expect(screen.getAllByText(/API Keys/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows progress dots', () => {
    render(<V2QuickstartWizard />);
    const progressDots = screen.getByTestId('progress-dots');
    expect(progressDots).toBeTruthy();
  });

  it('navigates to next step on Next click', () => {
    render(<V2QuickstartWizard />);
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);
    // apiKeys -> docker
    expect(screen.getByTestId('docker-step')).toBeTruthy();
  });

  it('navigates back on Back click', () => {
    useWizardStore.setState({ currentStep: 'docker' });
    render(<V2QuickstartWizard />);
    const backButton = screen.getByText('Back');
    fireEvent.click(backButton);
    expect(screen.getByTestId('apikey-step')).toBeTruthy();
  });

  it('shows Cancel on first step instead of Back', () => {
    render(<V2QuickstartWizard />);
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('shows Save & Start on preview step', () => {
    useWizardStore.setState({
      currentStep: 'preview',
      generatedYaml: 'test: yaml',
      generatedConfig: { test: 'config' },
    });
    render(<V2QuickstartWizard />);
    expect(screen.getByText('Save & Start')).toBeTruthy();
  });

  it('closes wizard on close button click', () => {
    render(<V2QuickstartWizard />);
    const closeButton = screen.getByTitle('Close wizard');
    fireEvent.click(closeButton);
    expect(useWizardStore.getState().isOpen).toBe(false);
  });

  it('calls onConfigSaved after successful save', async () => {
    const onConfigSaved = vi.fn();
    useWizardStore.setState({
      currentStep: 'preview',
      generatedYaml: 'test: yaml',
      generatedConfig: { test: 'config' },
    });

    // Mock saveConfig to succeed
    const originalSaveConfig = useWizardStore.getState().saveConfig;
    useWizardStore.setState({
      saveConfig: vi.fn(async () => {
        useWizardStore.setState({ savedConfigPath: '/path/to/config.yaml' });
        return true;
      }),
    });

    render(<V2QuickstartWizard onConfigSaved={onConfigSaved} />);
    const saveButton = screen.getByText('Save & Start');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onConfigSaved).toHaveBeenCalledWith('/path/to/config.yaml');
    });

    // Restore
    useWizardStore.setState({ saveConfig: originalSaveConfig });
  });

  it('renders agentConfig step', () => {
    useWizardStore.setState({ currentStep: 'agentConfig' });
    render(<V2QuickstartWizard />);
    expect(screen.getByTestId('agentconfig-step')).toBeTruthy();
  });

  it('shows loading state during save', () => {
    useWizardStore.setState({
      currentStep: 'preview',
      isLoading: true,
      generatedYaml: 'test: yaml',
    });
    render(<V2QuickstartWizard />);
    expect(screen.getByText('Saving...')).toBeTruthy();
  });

  it('filters visible steps based on agent count', () => {
    // With agentCount=1, should skip setupMode
    // Visible: apiKeys, docker, agentCount, agentConfig, skills, preview = 6 steps
    useWizardStore.setState({ agentCount: 1 });
    render(<V2QuickstartWizard />);
    const progressDots = screen.getByTestId('progress-dots');
    const dots = progressDots.querySelectorAll('[data-testid="progress-dot"]');
    expect(dots.length).toBe(6);
  });
});
