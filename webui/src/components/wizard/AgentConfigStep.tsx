/**
 * Agent Config Step Component
 *
 * Fourth step - configure provider and model for each agent.
 * Compact layout: agent tabs show inline selection, provider/model columns
 * fill all available vertical space, options integrated at bottom of model column.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, AlertCircle, Check, Search, Sparkles, X, Globe } from 'lucide-react';
import { useWizardStore, ProviderInfo, ProviderCapabilities, ReasoningEffort } from '../../stores/wizardStore';
import {
  buildQuickstartReasoningProfileKey,
  resolveQuickstartReasoningSync,
  type QuickstartReasoningProfile,
} from './quickstartReasoningSync';

interface ProviderCardProps {
  provider: ProviderInfo;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

const AGENT_FRAMEWORK_PROVIDER_IDS = new Set(['claude_code', 'codex', 'copilot', 'gemini_cli']);

function isAgentFrameworkProvider(provider: ProviderInfo): boolean {
  return provider.is_agent_framework || AGENT_FRAMEWORK_PROVIDER_IDS.has(provider.id);
}

function ProviderCard({ provider, isSelected, onSelect, disabled }: ProviderCardProps) {
  const isAgentFramework = isAgentFrameworkProvider(provider);

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`w-full px-3 py-2.5 text-left transition-all ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : isSelected
          ? 'bg-indigo-50 dark:bg-indigo-900/20'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {provider.name}
          </span>
          {isAgentFramework && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              <Bot className="h-2.5 w-2.5" />
              Agent
            </span>
          )}
          {disabled && (
            <span className="text-[10px] text-red-500">
              Needs {provider.env_var}
            </span>
          )}
        </div>
        {isSelected && (
          <div className="flex-shrink-0 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
    </button>
  );
}

interface ModelCardProps {
  model: string;
  isSelected: boolean;
  isDefault: boolean;
  onSelect: () => void;
}

function ModelCard({ model, isSelected, isDefault, onSelect }: ModelCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full px-3 py-2 text-left transition-all ${
        isSelected
          ? 'bg-emerald-50 dark:bg-emerald-900/20'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-mono text-gray-700 dark:text-gray-300">
            {model}
          </span>
          {isDefault && (
            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full">
              <Sparkles className="w-2.5 h-2.5" />
              Recommended
            </span>
          )}
        </div>
        {isSelected && (
          <div className="flex-shrink-0 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
            <Check className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>
    </button>
  );
}

// Per-agent option toggle component
/** Truncate a string to maxLen chars, appending ellipsis if needed. */
function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + '\u2026';
}

export function AgentConfigStep() {
  const providers = useWizardStore((s) => s.providers);
  const agents = useWizardStore((s) => s.agents);
  const setupMode = useWizardStore((s) => s.setupMode);
  const useDocker = useWizardStore((s) => s.useDocker);
  const setAgentConfig = useWizardStore((s) => s.setAgentConfig);
  const setAllAgentsConfig = useWizardStore((s) => s.setAllAgentsConfig);
  const setAgentReasoningEffort = useWizardStore((s) => s.setAgentReasoningEffort);
  const setAllAgentsReasoningEffort = useWizardStore((s) => s.setAllAgentsReasoningEffort);
  const setAgentWebSearch = useWizardStore((s) => s.setAgentWebSearch);
  const dynamicModels = useWizardStore((s) => s.dynamicModels);
  const loadingModels = useWizardStore((s) => s.loadingModels);
  const fetchDynamicModels = useWizardStore((s) => s.fetchDynamicModels);
  const providerCapabilities = useWizardStore((s) => s.providerCapabilities);
  const loadingCapabilities = useWizardStore((s) => s.loadingCapabilities);
  const fetchProviderCapabilities = useWizardStore((s) => s.fetchProviderCapabilities);

  // Search/filter state
  const [providerSearch, setProviderSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [reasoningProfile, setReasoningProfile] = useState<QuickstartReasoningProfile | null>(null);
  const [resolvedReasoningProfileKey, setResolvedReasoningProfileKey] = useState<string | null>(null);
  const [loadingReasoningProfile, setLoadingReasoningProfile] = useState(false);
  const lastAppliedReasoningProfileKeysRef = useRef<Record<string, string | null | undefined>>({});


  // System message mode for "same" setup mode: 'skip' | 'same' | 'different'

  // For multi-agent different config, track which agent we're configuring
  const [activeAgentIndex, setActiveAgentIndex] = useState(0);

  const availableProviders = providers.filter((p) => p.has_api_key);
  const unavailableProviders = providers.filter((p) => !p.has_api_key);

  // Get current agent's config
  const currentAgent = setupMode === 'same' ? agents[0] : agents[activeAgentIndex];
  const selectedProvider = providers.find((p) => p.id === currentAgent?.provider);

  // Fetch models when provider changes
  useEffect(() => {
    if (currentAgent?.provider && !dynamicModels[currentAgent.provider]) {
      fetchDynamicModels(currentAgent.provider);
    }
  }, [currentAgent?.provider, dynamicModels, fetchDynamicModels]);

  // Fetch capabilities when provider changes
  useEffect(() => {
    if (currentAgent?.provider && !providerCapabilities[currentAgent.provider]) {
      fetchProviderCapabilities(currentAgent.provider);
    }
  }, [currentAgent?.provider, providerCapabilities, fetchProviderCapabilities]);

  // Fetch quickstart reasoning profile when provider/model changes.
  useEffect(() => {
    const providerId = currentAgent?.provider;
    const model = currentAgent?.model;
    const requestProfileKey = buildQuickstartReasoningProfileKey(providerId, model);

    if (!providerId || !model) {
      setReasoningProfile(null);
      setResolvedReasoningProfileKey(null);
      setLoadingReasoningProfile(false);
      return;
    }

    let cancelled = false;
    setLoadingReasoningProfile(true);

    void fetch(
      `/api/quickstart/reasoning-profile?provider_id=${encodeURIComponent(providerId)}&model=${encodeURIComponent(model)}`,
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch reasoning profile');
        }
        return response.json();
      })
      .then((data: { profile: QuickstartReasoningProfile | null }) => {
        if (!cancelled) {
          setReasoningProfile(data.profile);
          setResolvedReasoningProfileKey(requestProfileKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReasoningProfile(null);
          setResolvedReasoningProfileKey(requestProfileKey);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingReasoningProfile(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentAgent?.provider, currentAgent?.model]);

  // Keep reasoning selection aligned with the shared quickstart profile.
  useEffect(() => {
    if (!currentAgent) {
      return;
    }

    const applyReasoningEffort = (value?: ReasoningEffort) => {
      if (setupMode === 'same') {
        setAllAgentsReasoningEffort(value);
      } else {
        setAgentReasoningEffort(activeAgentIndex, value);
      }
    };

    const reasoningTargetKey = setupMode === 'same' ? 'all' : String(activeAgentIndex);
    const profileKey = buildQuickstartReasoningProfileKey(currentAgent.provider, currentAgent.model);
    if (profileKey && resolvedReasoningProfileKey !== profileKey) {
      return;
    }
    const decision = resolveQuickstartReasoningSync({
      profile: reasoningProfile,
      profileKey,
      lastAppliedProfileKey: lastAppliedReasoningProfileKeysRef.current[reasoningTargetKey],
      currentEffort: currentAgent.reasoning_effort,
    });

    lastAppliedReasoningProfileKeysRef.current[reasoningTargetKey] = decision.nextProfileKey;
    if (decision.shouldApply) {
      applyReasoningEffort(decision.nextEffort ?? undefined);
    }
  }, [
    activeAgentIndex,
    currentAgent,
    resolvedReasoningProfileKey,
    reasoningProfile,
    setAgentReasoningEffort,
    setAllAgentsReasoningEffort,
    setupMode,
  ]);

  // Keyboard shortcut: press A/B/C etc. to switch agents (when in 'different' mode)
  const handleAgentKeySwitch = useCallback(
    (e: KeyboardEvent) => {
      if (setupMode !== 'different' || agents.length <= 1) return;
      // Don't trigger when typing in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const key = e.key.toLowerCase();
      const letterIndex = key.charCodeAt(0) - 'a'.charCodeAt(0);
      if (letterIndex >= 0 && letterIndex < agents.length) {
        setActiveAgentIndex(letterIndex);
      }
    },
    [setupMode, agents.length],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleAgentKeySwitch);
    return () => window.removeEventListener('keydown', handleAgentKeySwitch);
  }, [handleAgentKeySwitch]);

  // Get current provider's capabilities
  const currentCapabilities: ProviderCapabilities | null = currentAgent?.provider
    ? providerCapabilities[currentAgent.provider] || null
    : null;
  const isLoadingCapabilities = currentAgent?.provider
    ? loadingCapabilities[currentAgent.provider] || false
    : false;

  // Get available models for selected provider
  const availableModels = currentAgent?.provider
    ? (dynamicModels[currentAgent.provider] || selectedProvider?.models || []).filter(m => m !== 'custom')
    : [];

  // Filter providers by search
  const filteredAvailableProviders = providerSearch
    ? availableProviders.filter(p =>
        p.name.toLowerCase().includes(providerSearch.toLowerCase()) ||
        p.id.toLowerCase().includes(providerSearch.toLowerCase())
      )
    : availableProviders;

  const filteredUnavailableProviders = providerSearch
    ? unavailableProviders.filter(p =>
        p.name.toLowerCase().includes(providerSearch.toLowerCase()) ||
        p.id.toLowerCase().includes(providerSearch.toLowerCase())
      )
    : unavailableProviders;

  // Filter models by search
  const filteredModels = modelSearch
    ? availableModels.filter(m => m.toLowerCase().includes(modelSearch.toLowerCase()))
    : availableModels;

  // Handle provider selection
  const handleProviderSelect = (providerId: string) => {
    const providerInfo = providers.find((p) => p.id === providerId);
    const defaultModel = providerInfo?.default_model === 'custom' ? '' : (providerInfo?.default_model || '');

    if (setupMode === 'same') {
      setAllAgentsConfig(providerId, defaultModel, false); // Reset web search to false when provider changes
    } else {
      setAgentConfig(activeAgentIndex, providerId, defaultModel, false);
    }
    setModelSearch(''); // Clear model search when provider changes
  };

  // Handle web search toggle
  const handleWebSearchToggle = (enabled: boolean) => {
    if (setupMode === 'same') {
      // Update all agents
      agents.forEach((_, index) => {
        setAgentWebSearch(index, enabled);
      });
    } else {
      setAgentWebSearch(activeAgentIndex, enabled);
    }
  };

  const handleReasoningEffortChange = (value: string) => {
    const normalized = value === '' ? undefined : value as ReasoningEffort;
    if (setupMode === 'same') {
      setAllAgentsReasoningEffort(normalized);
    } else {
      setAgentReasoningEffort(activeAgentIndex, normalized);
    }
  };

  // Handle model selection
  const handleModelSelect = (model: string) => {
    if (setupMode === 'same') {
      setAllAgentsConfig(currentAgent?.provider || '', model);
    } else {
      setAgentConfig(activeAgentIndex, currentAgent?.provider || '', model);
    }
  };

  // Determine whether the options section has any content to show
  const hasOptions = currentAgent?.model && (
    reasoningProfile ||
    loadingReasoningProfile ||
    isLoadingCapabilities ||
    currentCapabilities?.supports_web_search ||
    (!useDocker && currentCapabilities?.supports_code_execution)
  );

  // Render options inline below the selected model
  const renderInlineOptions = () => (
    <div className="mt-1 ml-1 pl-3 border-l-2 border-blue-500/30 space-y-1.5 py-1.5">
      {isLoadingCapabilities ? (
        <div className="flex items-center gap-2 text-gray-400 text-xs p-1">
          <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          <span>Loading options...</span>
        </div>
      ) : (
        <>
          {loadingReasoningProfile && currentAgent?.model && (
            <div className="flex items-center gap-2 text-gray-400 text-xs">
              <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
              <span>Loading reasoning options...</span>
            </div>
          )}

          {reasoningProfile && (
            <div className="flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-gray-500 flex-shrink-0" />
              <span className="text-[11px] text-gray-500 flex-shrink-0">Reasoning</span>
              <select
                value={currentAgent?.reasoning_effort ?? reasoningProfile.default_effort}
                onChange={(e) => handleReasoningEffortChange(e.target.value)}
                className="flex-1 px-1.5 py-0.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600
                         rounded text-gray-800 dark:text-gray-200 text-[11px]
                         focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {reasoningProfile.choices.map(([label, value]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {currentCapabilities?.supports_web_search && (
            <div className="flex items-center gap-2">
              <Globe className="w-3 h-3 text-gray-500 flex-shrink-0" />
              <span className="text-[11px] text-gray-500">Web Search</span>
              <button
                onClick={() => handleWebSearchToggle(!(currentAgent?.enable_web_search ?? false))}
                className={`ml-auto relative w-7 h-4 rounded-full transition-colors ${
                  currentAgent?.enable_web_search ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                  currentAgent?.enable_web_search ? 'translate-x-3.5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  // Build agent tab label: "A: Provider / model" or "A: unconfigured"
  const buildAgentTabLabel = (agent: typeof agents[0]) => {
    const letter = agent.id.replace('agent_', '').toUpperCase();
    if (!agent.provider || !agent.model) {
      return `${letter}: unconfigured`;
    }
    const prov = providers.find((p) => p.id === agent.provider);
    const provName = prov ? truncate(prov.name, 14) : agent.provider;
    const modelName = truncate(agent.model, 16);
    return `${letter}: ${provName} / ${modelName}`;
  };

  if (availableProviders.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="space-y-6"
      >
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-semibold text-amber-700 dark:text-amber-400">
              No API Keys Found
            </h3>
          </div>
          <p className="text-sm text-amber-600 dark:text-amber-400 mb-2">
            Set up API keys for at least one provider:
          </p>
          <ul className="text-xs text-amber-600 dark:text-amber-400 list-disc list-inside space-y-0.5">
            <li>Set environment variables (e.g., OPENAI_API_KEY)</li>
            <li>Run <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">massgen --setup</code></li>
            <li>Create <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">~/.massgen/.env</code></li>
          </ul>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col min-h-0 gap-2"
    >
      {/* Compact agent tabs bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {setupMode === 'different' && agents.length > 1 ? (
          <>
            {agents.map((agent, index) => {
              const isConfigured = !!(agent.provider && agent.model);
              return (
                <button
                  key={agent.id}
                  onClick={() => setActiveAgentIndex(index)}
                  className={`px-2.5 py-1 rounded-md font-medium text-xs transition-all flex items-center gap-1 whitespace-nowrap ${
                    activeAgentIndex === index
                      ? 'bg-blue-500 text-white'
                      : isConfigured
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700'
                  }`}
                >
                  {buildAgentTabLabel(agent)}
                  {isConfigured && activeAgentIndex !== index && (
                    <Check className="w-3 h-3 flex-shrink-0" />
                  )}
                </button>
              );
            })}
            <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">
              Press {agents.map((_, i) => String.fromCharCode(65 + i)).join('/')}
            </span>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {setupMode === 'same'
                ? `All ${agents.length} agents`
                : 'Configure agent'}
            </span>
            {currentAgent?.provider && currentAgent?.model && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {selectedProvider?.name || currentAgent.provider} / {currentAgent.model}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Two-column layout: Providers | Models+Options - fills all remaining space */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Providers Column - 40% width */}
        <div className="flex flex-col gap-1.5 min-h-0 w-[40%] flex-shrink-0 pr-3 border-r border-gray-300 dark:border-gray-600">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
              Provider
            </h3>
            <span className="text-[10px] text-indigo-400 dark:text-indigo-500">
              {availableProviders.length} available
            </span>
          </div>

          {/* Provider search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={providerSearch}
              onChange={(e) => setProviderSearch(e.target.value)}
              placeholder="Search..."
              className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600
                       rounded-md text-gray-800 dark:text-gray-200 text-xs
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {providerSearch && (
              <button
                onClick={() => setProviderSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Provider list - scrollable, fills remaining height */}
          <div className="flex-1 overflow-y-auto pr-1 v2-scrollbar divide-y divide-gray-200 dark:divide-gray-600">
            {filteredAvailableProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isSelected={currentAgent?.provider === provider.id}
                onSelect={() => handleProviderSelect(provider.id)}
              />
            ))}

            {filteredUnavailableProviders.length > 0 && (
              <>
                <div className="text-[10px] text-red-400 dark:text-red-500 uppercase tracking-wide pt-3 pb-1 border-t border-gray-200 dark:border-gray-700 mt-1">
                  Needs API key
                </div>
                {filteredUnavailableProviders.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    isSelected={false}
                    onSelect={() => {}}
                    disabled
                  />
                ))}
              </>
            )}

            {filteredAvailableProviders.length === 0 && filteredUnavailableProviders.length === 0 && (
              <div className="text-center py-8 text-gray-500 text-xs">
                No providers match &quot;{providerSearch}&quot;
              </div>
            )}
          </div>
        </div>

        {/* Models + Options Column - 60% width */}
        <div className="flex flex-col gap-1.5 min-h-0 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
              Model
            </h3>
            {availableModels.length > 0 && (
              <span className="text-[10px] text-emerald-400 dark:text-emerald-500">
                {availableModels.length} models
              </span>
            )}
          </div>

          {!currentAgent?.provider ? (
            <div className="flex items-center justify-center flex-1 text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
              <p className="text-sm">Select a provider first</p>
            </div>
          ) : loadingModels[currentAgent.provider] ? (
            <div className="flex items-center justify-center gap-2 flex-1 text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Loading models...</p>
            </div>
          ) : (
            <>
              {/* Model search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Search or type custom model..."
                  className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600
                           rounded-md text-gray-800 dark:text-gray-200 text-xs
                           focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && modelSearch.trim()) {
                      handleModelSelect(modelSearch.trim());
                    }
                  }}
                />
                {modelSearch && (
                  <button
                    onClick={() => setModelSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Custom model hint */}
              {modelSearch && !filteredModels.includes(modelSearch) && (
                <button
                  onClick={() => handleModelSelect(modelSearch.trim())}
                  className="w-full px-3 py-1.5 rounded-md border border-dashed border-blue-300 dark:border-blue-700
                           bg-blue-50 dark:bg-blue-900/20 text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-blue-600 dark:text-blue-400">
                      Enter to use custom:
                    </span>
                    <span className="font-medium text-blue-700 dark:text-blue-300">
                      {modelSearch}
                    </span>
                  </div>
                </button>
              )}

              {/* Model list - scrollable, fills remaining height */}
              <div className="flex-1 overflow-y-auto pr-1 v2-scrollbar divide-y divide-gray-100 dark:divide-gray-700">
                {filteredModels.map((model) => {
                  const isSelected = currentAgent?.model === model;
                  return (
                    <div key={model}>
                      <ModelCard
                        model={model}
                        isSelected={isSelected}
                        isDefault={model === selectedProvider?.default_model}
                        onSelect={() => handleModelSelect(model)}
                      />
                      {/* Render options inline right after the selected model */}
                      {isSelected && hasOptions && renderInlineOptions()}
                    </div>
                  );
                })}

                {filteredModels.length === 0 && modelSearch && (
                  <div className="text-center py-4 text-gray-500 text-xs">
                    No models match &quot;{modelSearch}&quot;
                  </div>
                )}
              </div>

            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
