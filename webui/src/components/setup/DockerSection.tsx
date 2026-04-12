/**
 * Docker Section Component
 *
 * Extracted from SetupPage.tsx for reuse in both v1 SetupPage and v2 SetupOverlay.
 */

import { useEffect, useState } from 'react';
import {
  Check,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  useSetupStore,
  selectDockerDiagnostics,
  selectDockerLoading,
  selectIsPulling,
  selectPullProgress,
  selectPullComplete,
} from '../../stores/setupStore';

export function DockerSection() {
  const dockerDiagnostics = useSetupStore(selectDockerDiagnostics);
  const dockerLoading = useSetupStore(selectDockerLoading);
  const isPulling = useSetupStore(selectIsPulling);
  const pullProgress = useSetupStore(selectPullProgress);
  const pullComplete = useSetupStore(selectPullComplete);

  const fetchDockerDiagnostics = useSetupStore((s) => s.fetchDockerDiagnostics);
  const startDockerPull = useSetupStore((s) => s.startDockerPull);

  const [selectedImages, setSelectedImages] = useState<string[]>([
    'ghcr.io/massgen/mcp-runtime-sudo:latest',
  ]);

  useEffect(() => {
    fetchDockerDiagnostics();
  }, [fetchDockerDiagnostics]);

  const availableImages = [
    {
      name: 'ghcr.io/massgen/mcp-runtime-sudo:latest',
      description: 'Sudo image (recommended - allows package installation)',
    },
    {
      name: 'ghcr.io/massgen/mcp-runtime:latest',
      description: 'Standard image (no sudo access)',
    },
  ];

  const toggleImage = (imageName: string) => {
    setSelectedImages((prev) =>
      prev.includes(imageName) ? prev.filter((i) => i !== imageName) : [...prev, imageName]
    );
  };

  const handlePull = () => {
    startDockerPull(selectedImages);
  };

  // Status indicator colors
  const getStatusColor = (ok: boolean) =>
    ok ? 'text-green-500' : 'text-red-500';
  const getStatusIcon = (ok: boolean) =>
    ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Docker Setup</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Docker provides isolated execution environments for MassGen agents.
        </p>
      </div>

      {/* Docker Status */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Docker Status</h3>
          <button
            onClick={fetchDockerDiagnostics}
            disabled={dockerLoading}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`w-4 h-4 ${dockerLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {dockerLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : dockerDiagnostics ? (
          <div className="space-y-3">
            {/* Status Checklist */}
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <span className={getStatusColor(dockerDiagnostics.binary_installed)}>
                  {getStatusIcon(dockerDiagnostics.binary_installed)}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Docker binary installed</span>
                {dockerDiagnostics.docker_version && (
                  <span className="text-xs text-gray-500">({dockerDiagnostics.docker_version})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={getStatusColor(dockerDiagnostics.pip_library_installed)}>
                  {getStatusIcon(dockerDiagnostics.pip_library_installed)}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Docker Python library</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={getStatusColor(dockerDiagnostics.daemon_running)}>
                  {getStatusIcon(dockerDiagnostics.daemon_running)}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Docker daemon running</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={getStatusColor(dockerDiagnostics.has_permissions)}>
                  {getStatusIcon(dockerDiagnostics.has_permissions)}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Permissions OK</span>
              </div>
            </div>

            {/* Error Message with Resolution Steps */}
            {!dockerDiagnostics.is_available && dockerDiagnostics.error_message && (
              <div className="mt-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start gap-2 text-red-800 dark:text-red-200">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{dockerDiagnostics.error_message}</p>
                    {dockerDiagnostics.resolution_steps.length > 0 && (
                      <div className="mt-3">
                        <p className="font-medium mb-2">To fix this:</p>
                        <ol className="list-decimal list-inside space-y-1 text-sm">
                          {dockerDiagnostics.resolution_steps.map((step, i) => (
                            <li key={i} className={step.startsWith('  ') ? 'ml-4 list-none' : ''}>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Images Status */}
            {dockerDiagnostics.is_available && (
              <div className="mt-4">
                <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Installed Images</h4>
                {Object.keys(dockerDiagnostics.images_available).length > 0 ? (
                  <div className="space-y-1">
                    {Object.entries(dockerDiagnostics.images_available).map(([image, available]) => (
                      <div key={image} className="flex items-center gap-2 text-sm">
                        <span className={getStatusColor(available)}>
                          {getStatusIcon(available)}
                        </span>
                        <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">
                          {image}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No MassGen images found</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500">Unable to check Docker status</p>
        )}
      </div>

      {/* Image Selection & Pull - Only show if not all images are installed */}
      {dockerDiagnostics?.daemon_running && (() => {
        // Check which images are NOT yet installed
        const missingImages = availableImages.filter(
          (img) => !dockerDiagnostics.images_available[img.name]
        );

        // If all images are installed, don't show pull section
        if (missingImages.length === 0) {
          return (
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-6">
              <div className="flex items-center gap-3">
                <Check className="w-6 h-6 text-green-600" />
                <div>
                  <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
                    All Docker Images Installed
                  </h3>
                  <p className="text-green-700 dark:text-green-300 text-sm">
                    Your Docker environment is fully configured and ready to use.
                  </p>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Pull Missing Docker Images
            </h3>

            <div className="space-y-3 mb-6">
              {missingImages.map((img) => (
                <label key={img.name} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedImages.includes(img.name)}
                    onChange={() => toggleImage(img.name)}
                    disabled={isPulling}
                    className="mt-1 w-4 h-4 text-blue-600 rounded"
                  />
                  <div>
                    <span className="text-gray-800 dark:text-gray-200 font-mono text-sm">{img.name}</span>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{img.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Pull Progress */}
            {isPulling && Object.keys(pullProgress).length > 0 && (
              <div className="mb-4 space-y-2">
                {Object.entries(pullProgress).map(([image, progress]) => (
                  <div key={image} className="text-sm">
                    <div className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                      <span className="font-mono text-xs truncate max-w-xs">{image}</span>
                      <span>{progress.status}</span>
                    </div>
                    {progress.progress && (
                      <p className="text-xs text-gray-500 font-mono">{progress.progress}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {pullComplete && (
              <div className="mb-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <span className="text-green-800 dark:text-green-200 flex items-center gap-2">
                  <Check className="w-4 h-4" /> Images pulled successfully!
                </span>
              </div>
            )}

            <button
              onClick={handlePull}
              disabled={isPulling || selectedImages.length === 0}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {isPulling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Pulling...
                </>
              ) : (
                <>Pull Selected Images</>
              )}
            </button>
          </div>
        );
      })()}

      {/* Skip Option */}
      <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
        Docker is optional. You can skip this step if you prefer local execution mode.
      </p>
    </div>
  );
}
