/**
 * API Key Step Component (Redesigned)
 *
 * Self-contained API key configuration with three sections:
 * 1. Configured keys summary (collapsible chips)
 * 2. Add API keys (scrollable list with search)
 * 3. Agent Frameworks (collapsible, CLI-auth with detailed instructions)
 */

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  Bot,
  Check,
  Eye,
  EyeOff,
  ChevronDown,
  Search,
  X,
  Terminal,
  Key,
} from 'lucide-react';
import { useWizardStore } from '../../stores/wizardStore';
import {
  useSetupStore,
  selectProviders,
  selectApiKeyInputs,
  selectApiKeySaveLocation,
  selectApiKeySaveSuccess,
  selectApiKeySaveError,
} from '../../stores/setupStore';

// --- Agent framework auth metadata ---
// These are stable CLI commands that rarely change, so hardcoding is appropriate.
// Sourced from each backend's implementation in massgen/backend/*.py

interface FrameworkAuthInfo {
  authCommand: string;
  installCommand: string;
  apiKeyFallback: string | null;
  apiKeyEnvVars: string[];
  authCheckHint: string;
}

const FRAMEWORK_AUTH_INFO: Record<string, FrameworkAuthInfo> = {
  claude_code: {
    authCommand: 'claude login',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    apiKeyFallback: 'CLAUDE_CODE_API_KEY (preferred) or ANTHROPIC_API_KEY',
    apiKeyEnvVars: ['CLAUDE_CODE_API_KEY', 'ANTHROPIC_API_KEY'],
    authCheckHint: 'Tip: Use CLAUDE_CODE_API_KEY if you also have ANTHROPIC_API_KEY set for the Claude API backend, otherwise it will use the API key instead of subscription auth',
  },
  codex: {
    authCommand: 'codex login',
    installCommand: 'npm install -g @openai/codex',
    apiKeyFallback: 'OPENAI_API_KEY',
    apiKeyEnvVars: ['OPENAI_API_KEY'],
    authCheckHint: 'Check ~/.codex/auth.json for cached OAuth tokens',
  },
  copilot: {
    authCommand: 'gh auth login',
    installCommand: 'pip install github-copilot-sdk',
    apiKeyFallback: null,
    apiKeyEnvVars: [],
    authCheckHint: 'Requires active GitHub Copilot subscription',
  },
  gemini_cli: {
    authCommand: 'gemini',
    installCommand: 'npm install -g @google/gemini-cli',
    apiKeyFallback: 'GOOGLE_API_KEY or GEMINI_API_KEY',
    apiKeyEnvVars: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    authCheckHint: 'Check ~/.gemini/ for google_accounts.json or oauth_creds.json',
  },
};

// --- Inline sub-components ---

function SectionHeader({
  label,
  count,
  expanded,
  onToggle,
  accent = 'gray',
}: {
  label: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  accent?: 'gray' | 'green' | 'amber';
}) {
  const accentColors = {
    gray: 'text-gray-600 dark:text-gray-400',
    green: 'text-green-700 dark:text-green-400',
    amber: 'text-amber-700 dark:text-amber-400',
  };
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 w-full group py-1"
    >
      <ChevronDown
        className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${
          expanded ? '' : '-rotate-90'
        }`}
      />
      <span
        className={`text-xs font-semibold uppercase tracking-wide ${accentColors[accent]}`}
      >
        {label}
      </span>
      {count !== undefined && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          ({count})
        </span>
      )}
    </button>
  );
}

function ProviderRow({
  name,
  envVar,
  value,
  showPassword,
  onTogglePassword,
  onChange,
}: {
  name: string;
  envVar: string;
  value: string;
  showPassword: boolean;
  onTogglePassword: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-3 border-b border-gray-300 dark:border-gray-600 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0 whitespace-nowrap mr-4">
        {name}
      </span>
      <div className="relative flex-1 max-w-sm">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={envVar}
          className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600
                     rounded-md px-3 py-1.5 pr-9 text-sm text-gray-800 dark:text-gray-200
                     focus:ring-2 focus:ring-blue-500 focus:border-transparent
                     placeholder:text-gray-400 dark:placeholder:text-gray-500"
        />
        <button
          type="button"
          onClick={onTogglePassword}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600
                     dark:hover:text-gray-300 transition-colors"
        >
          {showPassword ? (
            <EyeOff className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

function ConfiguredChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-full text-xs font-medium text-green-700 dark:text-green-300">
      <Check className="w-3 h-3" />
      {name}
    </span>
  );
}

function FrameworkRow({ name, id }: { name: string; id: string }) {
  const [expanded, setExpanded] = useState(false);
  const authInfo = FRAMEWORK_AUTH_INFO[id];

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 px-3 py-2 w-full hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <Bot className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 text-left">
          {name}
        </span>
        {authInfo && (
          <code className="text-[10px] font-mono text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
            {authInfo.authCommand}
          </code>
        )}
        <ChevronDown
          className={`w-3 h-3 text-gray-400 transition-transform duration-200 flex-shrink-0 ${
            expanded ? '' : '-rotate-90'
          }`}
        />
      </button>

      {expanded && authInfo && (
        <div className="px-3 pb-3 pt-1 ml-7 space-y-2">
          {/* Auth command */}
          <div className="flex items-start gap-2">
            <Terminal className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              <span className="text-gray-600 dark:text-gray-300 font-medium">Authenticate:</span>{' '}
              Run{' '}
              <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono text-gray-700 dark:text-gray-300">
                {authInfo.authCommand}
              </code>
            </div>
          </div>

          {/* Install command */}
          <div className="flex items-start gap-2">
            <Terminal className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              <span className="text-gray-600 dark:text-gray-300 font-medium">Install:</span>{' '}
              <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono text-gray-700 dark:text-gray-300">
                {authInfo.installCommand}
              </code>
            </div>
          </div>

          {/* API key fallback */}
          {authInfo.apiKeyFallback ? (
            <div className="flex items-start gap-2">
              <Key className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                <span className="text-gray-600 dark:text-gray-300 font-medium">API key fallback:</span>{' '}
                {authInfo.apiKeyEnvVars.map((envVar, i) => (
                  <span key={envVar}>
                    {i > 0 && ' or '}
                    <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono text-gray-700 dark:text-gray-300">
                      {envVar}
                    </code>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <Key className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                <span className="text-gray-600 dark:text-gray-300 font-medium">API key fallback:</span>{' '}
                None &mdash; CLI auth only
              </div>
            </div>
          )}

          {/* Auth check hint */}
          <div className="text-[10px] text-gray-400 dark:text-gray-500 italic mt-1">
            {authInfo.authCheckHint}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main component ---

export function ApiKeyStep() {
  const isLoading = useWizardStore((s) => s.isLoading);
  const fetchWizardProviders = useWizardStore((s) => s.fetchProviders);

  const providers = useSetupStore(selectProviders);
  const apiKeyInputs = useSetupStore(selectApiKeyInputs);
  const apiKeySaveLocation = useSetupStore(selectApiKeySaveLocation);
  const apiKeySaveSuccess = useSetupStore(selectApiKeySaveSuccess);
  const apiKeySaveError = useSetupStore(selectApiKeySaveError);
  const setApiKeyInput = useSetupStore((s) => s.setApiKeyInput);
  const setApiKeySaveLocation = useSetupStore((s) => s.setApiKeySaveLocation);
  const saveApiKeys = useSetupStore((s) => s.saveApiKeys);
  const fetchSetupProviders = useSetupStore((s) => s.fetchProviders);

  // Local UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [showFrameworks, setShowFrameworks] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>(
    {},
  );
  const [envPaths, setEnvPaths] = useState<{ global: string; local: string }>({
    global: '~/.massgen/.env',
    local: './.env',
  });

  useEffect(() => {
    fetchSetupProviders();
    // Fetch actual .env file paths
    fetch('/api/setup/env-status')
      .then((r) => r.json())
      .then((data) => {
        setEnvPaths({
          global: data.global_env?.path ?? '~/.massgen/.env',
          local: data.local_env?.path ?? './.env',
        });
      })
      .catch(() => {});
  }, [fetchSetupProviders]);

  const toggleShowPassword = (envVar: string) => {
    setShowPasswords((prev) => ({ ...prev, [envVar]: !prev[envVar] }));
  };

  const handleRefresh = async () => {
    await saveApiKeys();
    fetchWizardProviders();
    fetchSetupProviders();
  };

  // --- Provider grouping (all derived from backend data, no hardcoding) ---
  const { configured, unconfigured, agentFrameworks } = useMemo(() => {
    const apiKeyProviders = providers.filter(
      (p) => p.env_var && !p.is_agent_framework,
    );
    const frameworks = providers.filter((p) => p.is_agent_framework);
    const cfgd = apiKeyProviders.filter((p) => p.has_api_key);
    const uncfgd = apiKeyProviders.filter((p) => !p.has_api_key);

    return {
      configured: cfgd,
      unconfigured: uncfgd,
      agentFrameworks: frameworks,
    };
  }, [providers]);

  // --- Search filtering ---
  const matchesSearch = (name: string, envVar?: string | null) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      name.toLowerCase().includes(q) ||
      (envVar && envVar.toLowerCase().includes(q))
    );
  };

  const filteredUnconfigured = unconfigured.filter((p) =>
    matchesSearch(p.name, p.env_var),
  );
  const isSearching = searchQuery.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-amber-500 dark:text-amber-400">
            API Keys
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Enter keys below or set as environment variables. Saved to a local{' '}
            <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">
              .env
            </code>{' '}
            file (owner-only permissions).
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                     text-gray-300 hover:text-white transition-colors
                     bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-md
                     disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <RefreshCw
            className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`}
          />
          Save &amp; refresh
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto v2-scrollbar space-y-2 pr-1">
        {/* --- Section 1: Configured Keys (static banner) --- */}
        {configured.length > 0 && (
          <div className="bg-green-50/50 dark:bg-green-900/10 border border-green-200/50 dark:border-green-800/30 rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 shrink-0">
              Configured ({configured.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {configured.map((p) => (
                <ConfiguredChip key={p.id} name={p.name} />
              ))}
            </div>
          </div>
        )}

        {/* --- Section 2: Agent Frameworks (with inline preview when collapsed) --- */}
        {agentFrameworks.length > 0 && (
          <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 w-full">
              <SectionHeader
                label="Agent Frameworks"
                count={agentFrameworks.length}
                expanded={showFrameworks}
                onToggle={() => setShowFrameworks(!showFrameworks)}
                accent="amber"
              />
              {!showFrameworks && (
                <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                  {agentFrameworks.map((p) => (
                    <span
                      key={p.id}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100/50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/40"
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {showFrameworks && (
              <div className="mt-1">
                <p className="text-[11px] text-gray-400 dark:text-gray-500 pl-5 mb-1">
                  These authenticate via their own CLI. Install the CLI and log
                  in &mdash; no API key needed (some accept API keys as
                  fallback). Click a row for details.
                </p>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  {agentFrameworks.map((p) => (
                    <FrameworkRow key={p.id} name={p.name} id={p.id} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- Section 3: Add API Keys --- */}
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/70">
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              Add API Keys
            </span>
            <div className="flex items-center gap-3">
              {/* Save location — inline */}
              <div className="flex items-center gap-2.5 text-[11px] text-gray-500 dark:text-gray-400">
                <span>Save to:</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="saveLocation"
                    checked={apiKeySaveLocation === 'global'}
                    onChange={() => setApiKeySaveLocation('global')}
                    className="w-3 h-3 text-blue-600"
                  />
                  <code className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{envPaths.global}</code>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="saveLocation"
                    checked={apiKeySaveLocation === 'local'}
                    onChange={() => setApiKeySaveLocation('local')}
                    className="w-3 h-3 text-blue-600"
                  />
                  <code className="text-[10px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{envPaths.local}</code>
                </label>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search providers..."
                  className="pl-8 pr-7 py-1 text-xs bg-white dark:bg-gray-900
                             border border-gray-300 dark:border-gray-600 rounded-md
                             focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             w-44 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* All providers in a scrollable list */}
          <div className="max-h-[400px] overflow-y-auto v2-scrollbar">
            {filteredUnconfigured.map((p) => (
              <ProviderRow
                key={p.id}
                name={p.name}
                envVar={p.env_var!}
                value={apiKeyInputs[p.env_var!] || ''}
                showPassword={showPasswords[p.env_var!] || false}
                onTogglePassword={() => toggleShowPassword(p.env_var!)}
                onChange={(val) => setApiKeyInput(p.env_var!, val)}
              />
            ))}

            {/* Empty search state */}
            {isSearching && filteredUnconfigured.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500">
                No providers match &ldquo;{searchQuery}&rdquo;
              </div>
            )}
          </div>
        </div>

        {/* Status messages */}
        {(apiKeySaveSuccess || apiKeySaveError) && (
          <div className="text-xs">
            {apiKeySaveSuccess && (
              <span className="text-green-600 dark:text-green-400 flex items-center gap-1.5">
                <Check className="w-3 h-3" /> API keys saved successfully
              </span>
            )}
            {apiKeySaveError && (
              <span className="text-red-600 dark:text-red-400 flex items-center gap-1.5">
                {apiKeySaveError}
              </span>
            )}
          </div>
        )}

      </div>
    </motion.div>
  );
}
