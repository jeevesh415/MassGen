/**
 * Skills Step Component
 *
 * Wizard step for browsing and installing skill packages.
 * Compact grid layout — no redundant headers, packages shown as cards.
 * Does NOT wrap SkillsSection (shared component) to avoid duplicate UI.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';

// Skill package type (mirrors SkillsSection)
interface SkillPackage {
  id: string;
  name: string;
  description: string;
  installed: boolean;
  skillCount?: number;
}

const DEFAULT_SKILL_PACKAGES: SkillPackage[] = [
  {
    id: 'anthropic',
    name: 'Anthropic Skills',
    description: 'Official Anthropic skills including code analysis, research, and more.',
    installed: false,
  },
  {
    id: 'openai',
    name: 'OpenAI Skills',
    description: 'Official OpenAI skill library with curated and experimental skill sets.',
    installed: false,
  },
  {
    id: 'vercel',
    name: 'Vercel Agent Skills',
    description: 'Vercel-maintained skill pack for modern full-stack and app workflows.',
    installed: false,
  },
  {
    id: 'agent_browser',
    name: 'Agent Browser',
    description: 'Browser-native automation via the agent-browser runtime.',
    installed: false,
  },
  {
    id: 'remotion',
    name: 'Remotion',
    description: 'Video generation and editing skill powered by Remotion.',
    installed: false,
  },
  {
    id: 'crawl4ai',
    name: 'Crawl4AI',
    description: 'Web crawling and scraping skill for extracting website content.',
    installed: false,
  },
];

export function SkillsStep() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [packages, setPackages] = useState<SkillPackage[]>(DEFAULT_SKILL_PACKAGES);

  const fetchSkills = async () => {
    try {
      const response = await fetch('/api/skills');
      if (!response.ok) {
        throw new Error('Failed to fetch skills');
      }
      const data = await response.json();

      // Prefer server-side package status (authoritative) when available.
      const packageMap = data.packages;
      if (packageMap && typeof packageMap === 'object') {
        const packageList: SkillPackage[] = Object.entries(packageMap).map(([id, pkg]) => {
          const typedPkg = pkg as Record<string, unknown>;
          return {
            id,
            name: String(typedPkg['name'] || id),
            description: String(typedPkg['description'] || ''),
            installed: Boolean(typedPkg['installed']),
            skillCount: typeof typedPkg['skill_count'] === 'number'
              ? typedPkg['skill_count']
              : (typeof typedPkg['skillCount'] === 'number' ? typedPkg['skillCount'] : undefined),
          };
        });
        setPackages(packageList);
      } else {
        setPackages(DEFAULT_SKILL_PACKAGES);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  const handleInstallPackage = async (packageId: string) => {
    setInstalling(packageId);
    setInstallError(null);

    try {
      const response = await fetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: packageId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Installation failed');
      }

      // Refresh skills list
      await fetchSkills();
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Installation failed');
    } finally {
      setInstalling(null);
    }
  };

  const installedCount = packages.filter((p) => p.installed).length;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col min-h-0 gap-3"
    >
      {/* Slim header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Skills
            <span className="font-normal text-gray-500 dark:text-gray-400 ml-1.5">
              &mdash; optional extensions for your agents
            </span>
          </h2>
        </div>
        {installedCount > 0 && (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <Check className="w-3 h-3" />
            {installedCount} installed
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      ) : (
        <>
          {/* Install Error */}
          {installError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-800 dark:text-red-200 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{installError}</span>
              </div>
            </div>
          )}

          {/* Skill packages grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 flex-1 content-start overflow-y-auto">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className={`flex flex-col justify-between rounded-lg border p-3 transition-all ${
                  pkg.installed
                    ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">
                      {pkg.name}
                    </span>
                    {pkg.installed && (
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-snug mb-2">
                    {pkg.description}
                  </p>
                </div>
                <div>
                  {pkg.installed ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full">
                      Installed{pkg.skillCount ? ` (${pkg.skillCount})` : ''}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleInstallPackage(pkg.id)}
                      disabled={installing !== null}
                      className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-400
                               text-white rounded-md transition-colors flex items-center gap-1.5"
                    >
                      {installing === pkg.id ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Installing...
                        </>
                      ) : (
                        'Install'
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer links */}
          <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-200 dark:border-gray-700">
            <span>
              CLI: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded text-gray-600 dark:text-gray-300">massgen --setup-skills</code>
            </span>
            <a
              href="https://skills.sh/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-500 hover:text-blue-400 transition-colors"
            >
              Browse more at skills.sh
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </>
      )}
    </motion.div>
  );
}
