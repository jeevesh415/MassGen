/**
 * API Keys Section Component
 *
 * Extracted from SetupPage.tsx for reuse in both v1 SetupPage and v2 SetupOverlay.
 */

import { useEffect, useState } from 'react';
import {
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Bot,
} from 'lucide-react';
import {
  useSetupStore,
  selectProviders,
  selectApiKeyInputs,
  selectApiKeySaveLocation,
  selectApiKeySaveSuccess,
  selectApiKeySaveError,
} from '../../stores/setupStore';

const AGENT_FRAMEWORK_PROVIDER_IDS = new Set(['claude_code', 'codex', 'copilot', 'gemini_cli']);

export function ApiKeysSection() {
  const providers = useSetupStore(selectProviders);
  const apiKeyInputs = useSetupStore(selectApiKeyInputs);
  const apiKeySaveLocation = useSetupStore(selectApiKeySaveLocation);
  const apiKeySaveSuccess = useSetupStore(selectApiKeySaveSuccess);
  const apiKeySaveError = useSetupStore(selectApiKeySaveError);

  const setApiKeyInput = useSetupStore((s) => s.setApiKeyInput);
  const setApiKeySaveLocation = useSetupStore((s) => s.setApiKeySaveLocation);
  const fetchProviders = useSetupStore((s) => s.fetchProviders);

  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const toggleShowPassword = (envVar: string) => {
    setShowPasswords((prev) => ({ ...prev, [envVar]: !prev[envVar] }));
  };

  const isAgentFrameworkProvider = (providerId: string, isAgentFramework?: boolean) =>
    Boolean(isAgentFramework) || AGENT_FRAMEWORK_PROVIDER_IDS.has(providerId);

  // Sort providers: popular ones first, then alphabetically
  const popularProviderIds = ['openai', 'claude', 'gemini', 'grok'];
  // Separate CLI-auth providers from other providers (they have special auth)
  const claudeCodeProvider = providers.find((p) => p.id === 'claude_code');
  const copilotProvider = providers.find((p) => p.id === 'copilot');
  const otherProviders = providers.filter((p) => p.id !== 'claude_code' && p.id !== 'copilot');
  const configuredProviders = otherProviders.filter((p) => p.has_api_key);
  const unconfiguredProviders = otherProviders.filter((p) => !p.has_api_key);

  // Sort unconfigured: popular first, then rest alphabetically
  const sortedUnconfiguredProviders = [...unconfiguredProviders].sort((a, b) => {
    const aPopular = popularProviderIds.indexOf(a.id);
    const bPopular = popularProviderIds.indexOf(b.id);
    if (aPopular !== -1 && bPopular !== -1) return aPopular - bPopular;
    if (aPopular !== -1) return -1;
    if (bPopular !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  const [showConfiguredKeys, setShowConfiguredKeys] = useState(false);

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Configure API Keys</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Enter API keys for the providers you want to use. Keys are saved securely to your local
          environment.
        </p>
      </div>

      {/* Configured Keys Summary - Always visible at top */}
      {configuredProviders.length > 0 && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Check className="w-5 h-5 text-green-600" />
              <div>
                <span className="font-medium text-green-800 dark:text-green-200">
                  {configuredProviders.length} API Key{configuredProviders.length !== 1 ? 's' : ''} Configured
                </span>
                <p className="text-green-700 dark:text-green-300 text-sm">
                  {configuredProviders.map(p => p.name).join(', ')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowConfiguredKeys(!showConfiguredKeys)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-green-700 dark:text-green-300
                       bg-green-100 dark:bg-green-900/50 hover:bg-green-200 dark:hover:bg-green-900
                       rounded-lg transition-colors"
            >
              {showConfiguredKeys ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showConfiguredKeys ? 'Hide' : 'Show'}
            </button>
          </div>
          {showConfiguredKeys && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {configuredProviders.map((provider) => (
                <div
                  key={provider.id}
                  className="bg-white dark:bg-gray-800 border border-green-200 dark:border-green-800 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 dark:text-gray-200">{provider.name}</span>
                      {isAgentFrameworkProvider(provider.id, provider.is_agent_framework) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          <Bot className="h-3 w-3" />
                          Agent
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">••••••••</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Claude Code Section */}
      {claudeCodeProvider && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-800 dark:text-gray-200">Claude Code</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                <Bot className="h-3 w-3" />
                Agent framework
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                (available if logged in via <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">claude</code> CLI)
              </span>
            </div>
          </div>
          <div className="relative">
            <input
              type={showPasswords['CLAUDE_CODE_API_KEY'] ? 'text' : 'password'}
              value={apiKeyInputs['CLAUDE_CODE_API_KEY'] || ''}
              onChange={(e) => setApiKeyInput('CLAUDE_CODE_API_KEY', e.target.value)}
              placeholder="CLAUDE_CODE_API_KEY (optional)"
              className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => toggleShowPassword('CLAUDE_CODE_API_KEY')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700
                       dark:text-gray-400 dark:hover:text-gray-200"
            >
              {showPasswords['CLAUDE_CODE_API_KEY'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* GitHub Copilot Section */}
      {copilotProvider && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-800 dark:text-gray-200">GitHub Copilot</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                <Bot className="h-3 w-3" />
                Agent framework
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                (available if logged in via <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">copilot</code> CLI <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">/login</code> and <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">github-copilot-sdk</code> installed)
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No API key required. Uses Copilot CLI or GitHub token authentication.
          </p>
        </div>
      )}

      {/* All Unconfigured Providers */}
      {sortedUnconfiguredProviders.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Add API Keys</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {sortedUnconfiguredProviders.map((provider) => (
              <div
                key={provider.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <label className="font-medium text-gray-800 dark:text-gray-200">{provider.name}</label>
                    {isAgentFrameworkProvider(provider.id, provider.is_agent_framework) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        <Bot className="h-3 w-3" />
                        Agent
                      </span>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <input
                    type={showPasswords[provider.env_var!] ? 'text' : 'password'}
                    value={apiKeyInputs[provider.env_var!] || ''}
                    onChange={(e) => setApiKeyInput(provider.env_var!, e.target.value)}
                    placeholder={provider.env_var || ''}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowPassword(provider.env_var!)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    {showPasswords[provider.env_var!] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Messages */}
      {(apiKeySaveSuccess || apiKeySaveError) && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          {apiKeySaveSuccess && (
            <span className="text-green-600 dark:text-green-400 flex items-center gap-2">
              <Check className="w-4 h-4" /> API keys saved successfully
            </span>
          )}
          {apiKeySaveError && (
            <span className="text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {apiKeySaveError}
            </span>
          )}
        </div>
      )}

      {/* Save location and auto-save note */}
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-4">
          <span>Save to:</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="saveLocation"
              checked={apiKeySaveLocation === 'global'}
              onChange={() => setApiKeySaveLocation('global')}
              className="w-3.5 h-3.5 text-blue-600"
            />
            <span>~/.massgen/.env</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="saveLocation"
              checked={apiKeySaveLocation === 'local'}
              onChange={() => setApiKeySaveLocation('local')}
              className="w-3.5 h-3.5 text-blue-600"
            />
            <span>./.env</span>
          </label>
        </div>
        <span>(saved on Next)</span>
      </div>
    </div>
  );
}
