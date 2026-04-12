/**
 * Docker Step Component
 *
 * First step in the quickstart wizard - choose Docker or local mode.
 * Full-bleed layout: two large side-by-side panels, vertically centered.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Container, Monitor, AlertTriangle, Check, ShieldCheck, Zap, Package, FileText, PencilLine, RefreshCw, AlertCircle, Loader2, Download } from 'lucide-react';
import { useWizardStore } from '../../stores/wizardStore';
import {
  useSetupStore,
  selectDockerDiagnostics,
  selectDockerLoading,
  selectIsPulling,
  selectPullProgress,
  selectPullComplete,
} from '../../stores/setupStore';

export function DockerStep() {
  const useDocker = useWizardStore((s) => s.useDocker);
  const setUseDocker = useWizardStore((s) => s.setUseDocker);
  const setupStatus = useWizardStore((s) => s.setupStatus);

  const dockerAvailable = setupStatus?.docker_available ?? false;

  // Docker diagnostics & pull state
  const dockerDiagnostics = useSetupStore(selectDockerDiagnostics);
  const dockerLoading = useSetupStore(selectDockerLoading);
  const fetchDockerDiagnostics = useSetupStore((s) => s.fetchDockerDiagnostics);
  const isPulling = useSetupStore(selectIsPulling);
  const pullProgress = useSetupStore(selectPullProgress);
  const pullComplete = useSetupStore(selectPullComplete);
  const startDockerPull = useSetupStore((s) => s.startDockerPull);

  const [selectedImages, setSelectedImages] = useState<string[]>([
    'ghcr.io/massgen/mcp-runtime-sudo:latest',
  ]);

  const availableImages = [
    { name: 'ghcr.io/massgen/mcp-runtime-sudo:latest', label: 'Sudo (recommended)' },
    { name: 'ghcr.io/massgen/mcp-runtime:latest', label: 'Standard (no sudo)' },
  ];

  const toggleImage = (imageName: string) => {
    setSelectedImages((prev) =>
      prev.includes(imageName) ? prev.filter((i) => i !== imageName) : [...prev, imageName]
    );
  };

  useEffect(() => {
    if (useDocker) {
      fetchDockerDiagnostics();
    }
  }, [useDocker, fetchDockerDiagnostics]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col items-center justify-center"
    >
      <div className="w-full">
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-1">
            Execution Mode
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choose how agents execute code and commands.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          {/* Docker Option */}
          <button
            onClick={() => dockerAvailable && setUseDocker(true)}
            disabled={!dockerAvailable}
            className={`w-full p-6 rounded-xl border-2 text-left transition-all flex flex-col gap-4 min-h-[240px] ${
              useDocker && dockerAvailable
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md shadow-blue-500/10'
                : dockerAvailable
                ? 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md'
                : 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${
                  useDocker && dockerAvailable
                    ? 'bg-blue-500/10'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <Container className={`w-6 h-6 ${useDocker && dockerAvailable ? 'text-blue-500' : 'text-gray-500'}`} />
                </div>
                <div>
                  <span className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    Docker
                  </span>
                  {dockerAvailable && (
                    <span className="ml-2 text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                      Recommended
                    </span>
                  )}
                </div>
              </div>
              {useDocker && dockerAvailable && (
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400">
              Full code execution in isolated containers. Agents can run commands, install packages, and use tools safely.
            </p>

            <div className="flex-1" />

            <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                <span>Sandboxed execution - agents can't affect your system</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                <span>Run shell commands, scripts, and executables</span>
              </div>
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                <span>Install packages and dependencies on the fly</span>
              </div>
            </div>

            {!dockerAvailable && (
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs mt-1 pt-3 border-t border-gray-200 dark:border-gray-700">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Docker images not found. Run <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">massgen --setup-docker</code></span>
              </div>
            )}
          </button>

          {/* Local Option */}
          <button
            onClick={() => setUseDocker(false)}
            className={`w-full p-6 rounded-xl border-2 text-left transition-all flex flex-col gap-4 min-h-[240px] ${
              !useDocker
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md shadow-blue-500/10'
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${
                  !useDocker
                    ? 'bg-blue-500/10'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  <Monitor className={`w-6 h-6 ${!useDocker ? 'text-blue-500' : 'text-gray-500'}`} />
                </div>
                <span className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  Local
                </span>
              </div>
              {!useDocker && (
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400">
              File operations only. Agents can create and edit files but cannot execute commands or install packages.
            </p>

            <div className="flex-1" />

            <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span>Read, write, and organize files in the workspace</span>
              </div>
              <div className="flex items-center gap-2">
                <PencilLine className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span>Great for writing, research, and content generation</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span>No Docker setup required - works immediately</span>
              </div>
            </div>
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-500 text-center mt-4">
          You can change this later in the config file.
        </p>

        {/* Docker diagnostics when Docker is selected */}
        {useDocker && (
          <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
            {/* Status row */}
            <div className="px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                  Docker Status
                </span>
                <button
                  onClick={fetchDockerDiagnostics}
                  disabled={dockerLoading}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${dockerLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {dockerDiagnostics ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    {dockerDiagnostics.binary_installed
                      ? <Check className="w-3 h-3 text-green-500" />
                      : <AlertCircle className="w-3 h-3 text-red-500" />}
                    <span className="text-gray-600 dark:text-gray-400">Installed</span>
                    {dockerDiagnostics.docker_version && (
                      <span className="text-[10px] text-gray-400">({dockerDiagnostics.docker_version})</span>
                    )}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    {dockerDiagnostics.daemon_running
                      ? <Check className="w-3 h-3 text-green-500" />
                      : <AlertCircle className="w-3 h-3 text-red-500" />}
                    <span className="text-gray-600 dark:text-gray-400">Running</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    {dockerDiagnostics.has_permissions
                      ? <Check className="w-3 h-3 text-green-500" />
                      : <AlertCircle className="w-3 h-3 text-red-500" />}
                    <span className="text-gray-600 dark:text-gray-400">Permissions</span>
                  </span>
                </div>
              ) : dockerLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Checking...
                </div>
              ) : (
                <span className="text-xs text-gray-400">Unable to check status</span>
              )}
            </div>

            {/* Images section */}
            {dockerDiagnostics?.is_available && (
              <div className="px-3 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                  Images
                </span>

                {/* Installed images */}
                {Object.keys(dockerDiagnostics.images_available).length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {Object.entries(dockerDiagnostics.images_available).map(([image, available]) => (
                      <div key={image} className="flex items-center gap-2 text-xs">
                        {available
                          ? <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                          : <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                        <span className="text-gray-500 dark:text-gray-400 font-mono text-[11px] truncate">
                          {image}
                        </span>
                        {available && (
                          <span className="text-[10px] text-green-600 dark:text-green-400 ml-auto flex-shrink-0">installed</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Pull missing images */}
                {(() => {
                  const missingImages = availableImages.filter(
                    (img) => !dockerDiagnostics.images_available[img.name]
                  );
                  if (missingImages.length === 0) return null;

                  return (
                    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <div className="space-y-1.5">
                        {missingImages.map((img) => (
                          <label key={img.name} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedImages.includes(img.name)}
                              onChange={() => toggleImage(img.name)}
                              disabled={isPulling}
                              className="w-3 h-3 text-blue-600 rounded"
                            />
                            <span className="text-gray-600 dark:text-gray-300 font-mono text-[11px] truncate">{img.name}</span>
                            <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{img.label}</span>
                          </label>
                        ))}
                      </div>

                      {/* Pull progress */}
                      {isPulling && Object.keys(pullProgress).length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          {Object.entries(pullProgress).map(([image, progress]) => (
                            <div key={image} className="text-[11px] text-gray-400">
                              <span className="font-mono truncate">{image.split('/').pop()}</span>: {progress.status}
                              {progress.progress && <span className="ml-1 font-mono">{progress.progress}</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      {pullComplete && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                          <Check className="w-3 h-3" /> Images pulled successfully
                        </div>
                      )}

                      <button
                        onClick={() => startDockerPull(selectedImages)}
                        disabled={isPulling || selectedImages.length === 0}
                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-500 text-white rounded-md transition-colors"
                      >
                        {isPulling ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Pulling...</>
                        ) : (
                          <><Download className="w-3 h-3" /> Pull Selected</>
                        )}
                      </button>
                    </div>
                  );
                })()}

                {/* All installed confirmation */}
                {availableImages.every((img) => dockerDiagnostics.images_available[img.name]) && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                    <Check className="w-3 h-3" /> All images installed
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
