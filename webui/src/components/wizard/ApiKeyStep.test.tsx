/**
 * Tests for the redesigned ApiKeyStep component.
 *
 * Verifies: provider grouping (configured, unconfigured scrollable, agent frameworks),
 * collapsible sections, search filtering, framework auth details, save & refresh.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ApiKeyStep } from './ApiKeyStep';
import { useSetupStore } from '../../stores/setupStore';
import { useWizardStore } from '../../stores/wizardStore';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
}));

// Helper to create provider fixtures
function makeProvider(
  id: string,
  name: string,
  envVar: string | null,
  hasApiKey: boolean,
  isAgentFramework = false,
) {
  return { id, name, env_var: envVar, has_api_key: hasApiKey, is_agent_framework: isAgentFramework };
}

// Providers are returned pre-sorted by backend priority
const MOCK_PROVIDERS = [
  // Agent frameworks (first in backend sort)
  makeProvider('claude_code', 'Claude Code', null, true, true),
  makeProvider('codex', 'Codex', null, true, true),
  makeProvider('copilot', 'GitHub Copilot', null, true, true),
  makeProvider('gemini_cli', 'Gemini CLI', null, true, true),
  // API key providers - configured
  makeProvider('openai', 'OpenAI', 'OPENAI_API_KEY', true),
  makeProvider('groq', 'Groq', 'GROQ_API_KEY', true),
  // API key providers - unconfigured (backend sort order)
  makeProvider('claude', 'Claude', 'ANTHROPIC_API_KEY', false),
  makeProvider('gemini', 'Gemini', 'GEMINI_API_KEY', false),
  makeProvider('grok', 'Grok', 'XAI_API_KEY', false),
  makeProvider('azure_openai', 'Azure OpenAI', 'AZURE_OPENAI_API_KEY', false),
  makeProvider('together', 'Together AI', 'TOGETHER_API_KEY', false),
  makeProvider('cerebras', 'Cerebras', 'CEREBRAS_API_KEY', false),
  makeProvider('fireworks', 'Fireworks AI', 'FIREWORKS_API_KEY', false),
  makeProvider('openrouter', 'OpenRouter', 'OPENROUTER_API_KEY', false),
];

describe('ApiKeyStep', () => {
  beforeEach(() => {
    useSetupStore.setState({
      providers: MOCK_PROVIDERS,
      apiKeyInputs: {},
      apiKeySaveLocation: 'global',
      apiKeySaveSuccess: false,
      apiKeySaveError: null,
    });
    useWizardStore.setState({
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  // --- Section rendering ---

  it('renders the header with Save & refresh button', () => {
    render(<ApiKeyStep />);
    expect(screen.getByText('API Keys')).toBeTruthy();
    expect(screen.getByText(/Save & refresh/)).toBeTruthy();
  });

  it('renders configured providers section when keys exist', () => {
    render(<ApiKeyStep />);
    // Should show "Configured" section header with count
    const header = screen.getByText(/Configured/i);
    expect(header).toBeTruthy();
    // Configured section starts expanded by default, so chips should be visible
    expect(screen.getByText('OpenAI')).toBeTruthy();
    expect(screen.getByText('Groq')).toBeTruthy();
  });

  it('hides configured section when no API key providers have keys', () => {
    const noKeysProviders = MOCK_PROVIDERS.map((p) => ({
      ...p,
      has_api_key: p.is_agent_framework ? p.has_api_key : false,
    }));
    useSetupStore.setState({ providers: noKeysProviders });
    render(<ApiKeyStep />);
    // The "Configured" section should not appear (agent frameworks don't count)
    // But "Add API Keys" should still be present
    expect(screen.getByText(/Add API Keys/i)).toBeTruthy();
    // No configured section header
    const allText = document.body.textContent || '';
    expect(allText).not.toContain('Configured');
  });

  it('renders unconfigured providers with input fields', () => {
    render(<ApiKeyStep />);
    // All unconfigured providers should be visible in the scrollable list
    expect(screen.getByPlaceholderText('ANTHROPIC_API_KEY')).toBeTruthy();
    expect(screen.getByPlaceholderText('GEMINI_API_KEY')).toBeTruthy();
    expect(screen.getByPlaceholderText('XAI_API_KEY')).toBeTruthy();
  });

  it('renders agent frameworks in a separate section', () => {
    render(<ApiKeyStep />);
    expect(screen.getByText(/Agent Frameworks/i)).toBeTruthy();
    // Expand the section
    fireEvent.click(screen.getByText(/Agent Frameworks/i));
    expect(screen.getByText('Claude Code')).toBeTruthy();
    expect(screen.getByText('Codex')).toBeTruthy();
    expect(screen.getByText('GitHub Copilot')).toBeTruthy();
    expect(screen.getByText('Gemini CLI')).toBeTruthy();
  });

  // --- Scrollable provider list (no "show more" toggle) ---

  it('shows all unconfigured providers in a scrollable list without a toggle', () => {
    render(<ApiKeyStep />);
    // All unconfigured providers should be visible immediately (no "show more" button)
    expect(screen.getByPlaceholderText('ANTHROPIC_API_KEY')).toBeTruthy();
    expect(screen.getByPlaceholderText('CEREBRAS_API_KEY')).toBeTruthy();
    expect(screen.getByPlaceholderText('FIREWORKS_API_KEY')).toBeTruthy();
    expect(screen.getByPlaceholderText('OPENROUTER_API_KEY')).toBeTruthy();

    // No "show more" button should exist
    expect(screen.queryByText(/more providers/i)).toBeNull();
  });

  it('agent frameworks section is collapsed by default', () => {
    render(<ApiKeyStep />);
    // The section header should exist but Claude Code details shouldn't be visible
    expect(screen.getByText(/Agent Frameworks/i)).toBeTruthy();
    // Agent framework names should not be visible until expanded
    // (they're inside a collapsed section)
    expect(screen.queryByText('Codex')).toBeNull();
  });

  // --- Framework auth details ---

  it('shows auth command badge on framework rows when expanded', () => {
    render(<ApiKeyStep />);
    // Expand agent frameworks section
    fireEvent.click(screen.getByText(/Agent Frameworks/i));

    // Each framework should show its auth command as a badge
    expect(screen.getByText('claude login')).toBeTruthy();
    expect(screen.getByText('codex login')).toBeTruthy();
    expect(screen.getByText('gh auth login')).toBeTruthy();
    // Gemini CLI auth command is just "gemini"
    expect(screen.getByText('gemini')).toBeTruthy();
  });

  it('expands framework row to show auth details on click', () => {
    render(<ApiKeyStep />);
    // Expand agent frameworks section
    fireEvent.click(screen.getByText(/Agent Frameworks/i));

    // Click on Claude Code row to expand it
    fireEvent.click(screen.getByText('Claude Code'));

    // Should show install command
    expect(screen.getByText('npm install -g @anthropic-ai/claude-code')).toBeTruthy();
    // Should show API key fallback env vars
    expect(screen.getByText('CLAUDE_CODE_API_KEY')).toBeTruthy();
    expect(screen.getByText('ANTHROPIC_API_KEY')).toBeTruthy();
  });

  it('shows "CLI auth only" for copilot which has no API key fallback', () => {
    render(<ApiKeyStep />);
    // Expand agent frameworks section
    fireEvent.click(screen.getByText(/Agent Frameworks/i));

    // Click on GitHub Copilot row to expand it
    fireEvent.click(screen.getByText('GitHub Copilot'));

    // Should show "None" for API key fallback
    const allText = document.body.textContent || '';
    expect(allText).toContain('CLI auth only');
  });

  // --- Search filtering ---

  it('filters providers when typing in search', () => {
    render(<ApiKeyStep />);
    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'cerebras' } });

    // Should show Cerebras
    expect(screen.getByPlaceholderText('CEREBRAS_API_KEY')).toBeTruthy();
    // Should hide non-matching providers
    expect(screen.queryByPlaceholderText('ANTHROPIC_API_KEY')).toBeNull();
  });

  // --- Input interaction ---

  it('calls setApiKeyInput when typing in a provider input', () => {
    const setApiKeyInput = vi.fn();
    useSetupStore.setState({ setApiKeyInput });
    render(<ApiKeyStep />);

    const input = screen.getByPlaceholderText('ANTHROPIC_API_KEY');
    fireEvent.change(input, { target: { value: 'sk-test-123' } });
    expect(setApiKeyInput).toHaveBeenCalledWith('ANTHROPIC_API_KEY', 'sk-test-123');
  });

  // --- Save location ---

  it('renders save location radio buttons', () => {
    render(<ApiKeyStep />);
    expect(screen.getByText('~/.massgen/.env')).toBeTruthy();
    expect(screen.getByText('./.env')).toBeTruthy();
  });
});
