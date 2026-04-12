/**
 * Preview Step Component
 *
 * Final step - preview generated config and save.
 * Allows editing both the filename and the YAML content.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Check, AlertCircle, Loader2, Pencil, Code } from 'lucide-react';
import { useWizardStore } from '../../stores/wizardStore';
import { GuideTip } from '../v2/onboarding/GuideTip';

export function PreviewStep() {
  const generatedYaml = useWizardStore((s) => s.generatedYaml);
  const isLoading = useWizardStore((s) => s.isLoading);
  const error = useWizardStore((s) => s.error);
  const setupStatus = useWizardStore((s) => s.setupStatus);
  const configFilename = useWizardStore((s) => s.configFilename);
  const configSaveLocation = useWizardStore((s) => s.configSaveLocation);
  const setConfigFilename = useWizardStore((s) => s.setConfigFilename);
  const setConfigSaveLocation = useWizardStore((s) => s.setConfigSaveLocation);
  const setGeneratedYaml = useWizardStore((s) => s.setGeneratedYaml);

  // Toggle between view and edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editedYaml, setEditedYaml] = useState(generatedYaml || '');

  // Sync editedYaml when generatedYaml changes
  if (generatedYaml && editedYaml === '' && generatedYaml !== editedYaml) {
    setEditedYaml(generatedYaml);
  }

  const handleSaveEdit = () => {
    setGeneratedYaml(editedYaml);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedYaml(generatedYaml || '');
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-8"
      >
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
        <p className="text-gray-600 dark:text-gray-400 text-sm">Generating configuration...</p>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-3"
      >
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <h3 className="text-base font-semibold text-red-700 dark:text-red-400">
              Error Generating Config
            </h3>
          </div>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </motion.div>
    );
  }

  const projectConfigDir = setupStatus?.config_path?.includes('/.massgen/')
    ? setupStatus.config_path.replace(/\/[^/]+$/, '')
    : '.massgen';
  const configDir = configSaveLocation === 'project' ? projectConfigDir : '~/.config/massgen';

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-3"
    >
      <GuideTip
        tipId="preview-save-config"
        title="This config is reused automatically"
        body="Save it and all future MassGen runs will use this config. You can edit it later or create new ones."
      />
      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-1">
          Review Configuration
        </h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Review and customize before saving.
        </p>
      </div>

      {/* Config save settings - compact */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-md p-3">
        <div className="flex items-end gap-3">
          {/* Save location */}
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Save Location
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfigSaveLocation('project')}
                className={`flex-1 px-2 py-1.5 rounded-md border text-xs text-left transition-colors ${
                  configSaveLocation === 'project'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <span className="font-medium">Project</span>
                <span className="text-gray-500 dark:text-gray-400 ml-1">(.massgen/)</span>
              </button>
              <button
                type="button"
                onClick={() => setConfigSaveLocation('global')}
                className={`flex-1 px-2 py-1.5 rounded-md border text-xs text-left transition-colors ${
                  configSaveLocation === 'global'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <span className="font-medium">Global</span>
                <span className="text-gray-500 dark:text-gray-400 ml-1">(~/.config/)</span>
              </button>
            </div>
          </div>

          {/* Filename */}
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              <Pencil className="w-3 h-3 inline mr-0.5" />
              Filename
            </label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={configFilename}
                onChange={(e) => setConfigFilename(e.target.value)}
                placeholder="config"
                className="flex-1 px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600
                         rounded-md text-gray-800 dark:text-gray-200 text-xs
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-gray-500 dark:text-gray-400 text-xs">.yaml</span>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5">
          {configDir}/{configFilename || 'config'}.yaml
        </p>
      </div>

      {/* YAML Content */}
      {generatedYaml && (
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-300">{configFilename || 'config'}.yaml</span>
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={handleCancelEdit}
                    className="px-2 py-0.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="px-2 py-0.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
                  >
                    Apply
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 hover:text-gray-200
                           bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                >
                  <Code className="w-3 h-3" />
                  Edit
                </button>
              )}
            </div>
          </div>

          {isEditing ? (
            <textarea
              value={editedYaml}
              onChange={(e) => setEditedYaml(e.target.value)}
              className="w-full h-[300px] p-3 bg-gray-900 text-gray-300 font-mono text-xs
                       resize-none focus:outline-none border-none"
              spellCheck={false}
            />
          ) : (
            <pre className="p-3 text-xs text-gray-300 overflow-x-auto max-h-[300px] overflow-y-auto">
              <code>{generatedYaml}</code>
            </pre>
          )}
        </div>
      )}

      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md px-3 py-2">
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-green-500" />
          <span className="text-xs text-green-700 dark:text-green-400">
            Click "Save & Start" to save this configuration and begin using MassGen.
          </span>
        </div>
      </div>
    </motion.div>
  );
}
