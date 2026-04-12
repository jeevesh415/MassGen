import { usePreCollabStore, type PreCollabPhaseStatus } from '../../../stores/v2/preCollabStore';
import { useTileStore } from '../../../stores/v2/tileStore';
import { SidebarItem } from './SessionSection';

interface PreCollabSectionProps {
  collapsed: boolean;
}

function StatusIcon({ status }: { status: PreCollabPhaseStatus }) {
  switch (status) {
    case 'running':
      return (
        <span className="w-2 h-2 rounded-full bg-v2-online animate-pulse" />
      );
    case 'completed':
      return (
        <svg className="w-3.5 h-3.5 text-v2-online" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 8l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'failed':
      return (
        <svg className="w-3.5 h-3.5 text-red-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <span className="w-2 h-2 rounded-full bg-v2-border" />
      );
  }
}

function resultCount(phaseId: string, results: ReturnType<typeof usePreCollabStore.getState>['results']): string | null {
  if (phaseId === 'persona_generation' && results.personas.length > 0) {
    return String(results.personas.length);
  }
  if (phaseId === 'criteria_generation' && results.evalCriteria.length > 0) {
    return String(results.evalCriteria.length);
  }
  if (phaseId === 'prompt_improvement' && results.improvedPrompt) {
    return '1';
  }
  return null;
}

function resultsTabFor(phaseId: string): string {
  if (phaseId === 'persona_generation') return 'personas';
  if (phaseId === 'criteria_generation') return 'criteria';
  if (phaseId === 'prompt_improvement') return 'prompt';
  return 'personas';
}

export function PreCollabSection({ collapsed }: PreCollabSectionProps) {
  const expectedPhaseIds = usePreCollabStore((s) => s.expectedPhaseIds);
  const phases = usePreCollabStore((s) => s.phases);
  const results = usePreCollabStore((s) => s.results);
  const openResultsPanel = usePreCollabStore((s) => s.openResultsPanel);
  const addTile = useTileStore((s) => s.addTile);

  // Don't render if no pre-collab phases exist
  if (expectedPhaseIds.length === 0) return null;

  const handlePhaseClick = (phaseId: string) => {
    const phase = phases[phaseId];
    if (!phase) return;

    if (phase.status === 'running') {
      // Open as a subagent tile to see inner activity
      addTile({
        id: `precollab-${phaseId}`,
        type: 'subagent-view',
        targetId: phaseId,
        label: phase.label,
      });
    } else if (phase.status === 'completed' || phase.status === 'failed') {
      // Open results panel
      openResultsPanel(resultsTabFor(phaseId));
    }
  };

  return (
    <>
      <div className="py-1">
        {!collapsed && (
          <div className="flex items-center px-2 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-v2-text-muted">
              Pre-Collab
            </span>
          </div>
        )}

        <div className="space-y-0.5">
          {expectedPhaseIds.map((phaseId) => {
            const phase = phases[phaseId];
            if (!phase) return null;

            const count = resultCount(phaseId, results);
            const suffix = count ? ` ${count}` : '';
            const label = `${phase.label}${suffix}`;

            return (
              <SidebarItem
                key={phaseId}
                collapsed={collapsed}
                icon={<StatusIcon status={phase.status} />}
                label={label}
                subtitle={
                  phase.status === 'running'
                    ? 'Running...'
                    : phase.status === 'failed'
                      ? phase.error || 'Failed'
                      : undefined
                }
                onClick={() => handlePhaseClick(phaseId)}
              />
            );
          })}
        </div>
      </div>
      <div className="mx-2 my-1">
        <div className="h-px bg-v2-border" />
      </div>
    </>
  );
}
