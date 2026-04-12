/**
 * Skills Section Component
 *
 * Extracted from SetupPage.tsx for reuse in both v1 SetupPage and v2 SetupOverlay.
 */

import { useEffect, useState } from 'react';
import {
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';

// Skill type from API
interface Skill {
  name: string;
  description: string;
  location: 'builtin' | 'user' | 'project';
  path: string;
  installed: boolean;
}

// Skill package type
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
    name: 'Anthropic Skills Collection',
    description: 'Official Anthropic skills including code analysis, research, and more.',
    installed: false,
  },
  {
    id: 'openai',
    name: 'OpenAI Skills Collection',
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
    name: 'Vercel Agent Browser Skill',
    description: 'Skill for browser-native automation via the agent-browser runtime.',
    installed: false,
  },
  {
    id: 'remotion',
    name: 'Remotion Skill',
    description: 'Video generation and editing skill powered by Remotion.',
    installed: false,
  },
  {
    id: 'crawl4ai',
    name: 'Crawl4AI',
    description: 'Web crawling and scraping skill for extracting content from websites.',
    installed: false,
  },
];

export function SkillsSection() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [showSkillsBrowser, setShowSkillsBrowser] = useState(false);

  // Skill packages that can be installed
  const [packages, setPackages] = useState<SkillPackage[]>(DEFAULT_SKILL_PACKAGES);

  const fetchSkills = async () => {
    try {
      const response = await fetch('/api/skills');
      if (!response.ok) {
        throw new Error('Failed to fetch skills');
      }
      const data = await response.json();
      const skillsList = data.skills || [];
      setSkills(skillsList);

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

  const builtinSkills = skills.filter((s) => s.location === 'builtin');
  const userSkills = skills.filter((s) => s.location === 'user');
  const projectSkills = skills.filter((s) => s.location === 'project');
  const installedSkills = [...userSkills, ...projectSkills];

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Skills</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Skills extend agent capabilities with specialized knowledge, workflows, and tools.
          Install skill packages below, then enable them in your YAML config.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <div>
                  <span className="font-medium text-green-800 dark:text-green-200">
                    {skills.length} Skill{skills.length !== 1 ? 's' : ''} Available
                  </span>
                  <p className="text-green-700 dark:text-green-300 text-sm">
                    {builtinSkills.length} built-in, {installedSkills.length} installed
                  </p>
                </div>
              </div>
              {skills.length > 0 && (
                <button
                  onClick={() => setShowSkillsBrowser(!showSkillsBrowser)}
                  className="text-sm text-green-700 dark:text-green-300 hover:underline"
                >
                  {showSkillsBrowser ? 'Hide Skills' : 'Browse Skills'}
                </button>
              )}
            </div>
          </div>

          {/* Install Error */}
          {installError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
                <AlertCircle className="w-5 h-5" />
                <span>{installError}</span>
              </div>
            </div>
          )}

          {/* Skill Packages */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Skill Packages
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Install skill packages to add new capabilities. Requires CLI installation (run in terminal).
            </p>
            <div className="grid gap-4">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          {pkg.name}
                        </span>
                        {pkg.installed ? (
                          <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
                            installed{pkg.skillCount ? ` (${pkg.skillCount} skills)` : ''}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                            not installed
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {pkg.description}
                      </p>
                    </div>
                    {pkg.installed ? (
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <button
                        onClick={() => handleInstallPackage(pkg.id)}
                        disabled={installing !== null}
                        className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-400
                                 text-white rounded-lg transition-colors flex items-center gap-2"
                      >
                        {installing === pkg.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
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
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Or install via CLI: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">massgen --setup-skills</code>
            </p>
          </div>

          {/* Skills Browser (collapsible) */}
          {showSkillsBrowser && skills.length > 0 && (
            <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Installed Skills
              </h3>

              {/* Built-in Skills */}
              {builtinSkills.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">Built-in</h4>
                  <div className="grid gap-2 md:grid-cols-2">
                    {builtinSkills.map((skill) => (
                      <div
                        key={skill.name}
                        className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {skill.name}
                          </span>
                          <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded">
                            built-in
                          </span>
                        </div>
                        {skill.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                            {skill.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Installed Skills (user + project) */}
              {installedSkills.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400">Installed</h4>
                  <div className="grid gap-2 md:grid-cols-2">
                    {installedSkills.map((skill) => (
                      <div
                        key={skill.name}
                        className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {skill.name}
                          </span>
                          <span className="px-1.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded">
                            {skill.location === 'user' ? 'user' : 'project'}
                          </span>
                        </div>
                        {skill.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                            {skill.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No Skills Message */}
          {skills.length === 0 && (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              <p className="text-sm">No skills installed yet. Install a package above to get started.</p>
            </div>
          )}
        </>
      )}

      <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
        Enable skills in your YAML config under{' '}
        <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">coordination.use_skills</code> and{' '}
        <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">coordination.massgen_skills</code>.
      </p>
    </div>
  );
}
