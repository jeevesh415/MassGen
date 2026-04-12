import { cn } from '../../../lib/utils';
import { usePreCollabStore } from '../../../stores/v2/preCollabStore';
import { WorkspaceModal } from './WorkspaceModal';

const TABS = [
  { id: 'personas', label: 'Personas' },
  { id: 'criteria', label: 'Eval Criteria' },
  { id: 'prompt', label: 'Prompt' },
] as const;

function PersonasTab() {
  const personas = usePreCollabStore((s) => s.results.personas);

  if (personas.length === 0) {
    return (
      <p className="text-sm text-v2-text-muted italic p-4">
        No personas were generated for this run.
      </p>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {personas.map((p) => (
        <div
          key={p.agentId}
          className="rounded-lg border border-v2-border bg-v2-surface p-4"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-v2-text-muted mb-2">
            {p.agentId}
          </div>
          <div className="text-sm text-v2-text whitespace-pre-wrap leading-relaxed">
            {p.summary}
          </div>
        </div>
      ))}
    </div>
  );
}

function CriteriaTab() {
  const criteria = usePreCollabStore((s) => s.results.evalCriteria);

  if (criteria.length === 0) {
    return (
      <p className="text-sm text-v2-text-muted italic p-4">
        No evaluation criteria were generated for this run.
      </p>
    );
  }

  // Group by category
  const grouped: Record<string, typeof criteria> = {};
  for (const c of criteria) {
    const cat = c.category || 'standard';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(c);
  }

  const categoryOrder = ['primary', 'must', 'standard', 'should', 'stretch', 'could'];
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => (categoryOrder.indexOf(a) === -1 ? 99 : categoryOrder.indexOf(a)) -
              (categoryOrder.indexOf(b) === -1 ? 99 : categoryOrder.indexOf(b)),
  );

  return (
    <div className="space-y-4 p-4">
      {sortedCategories.map((cat) => (
        <div key={cat}>
          <div className="text-xs font-semibold uppercase tracking-wide text-v2-text-muted mb-2">
            {cat}
          </div>
          <div className="space-y-2">
            {grouped[cat].map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-v2-border bg-v2-surface px-4 py-3"
              >
                <span className="text-sm text-v2-text">{c.text}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PromptTab() {
  const improvedPrompt = usePreCollabStore((s) => s.results.improvedPrompt);
  const phase = usePreCollabStore((s) => s.phases['prompt_improvement']);

  if (!improvedPrompt && (!phase || phase.status !== 'completed')) {
    const msg = phase?.status === 'failed'
      ? 'Prompt improvement failed. The original prompt was used.'
      : 'Prompt improvement was not enabled for this run.';
    return (
      <p className="text-sm text-v2-text-muted italic p-4">{msg}</p>
    );
  }

  return (
    <div className="p-4">
      <div className="rounded-lg border border-v2-border bg-v2-surface p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-v2-text-muted mb-2">
          {improvedPrompt ? 'Improved Prompt' : 'Result Preview'}
        </div>
        <div className="text-sm text-v2-text whitespace-pre-wrap leading-relaxed">
          {improvedPrompt || phase?.answerPreview || 'No preview available.'}
        </div>
      </div>
    </div>
  );
}

export function PreCollabResultsPanel() {
  const isOpen = usePreCollabStore((s) => s.resultsPanelOpen);
  const activeTab = usePreCollabStore((s) => s.activeResultsTab) || 'personas';
  const close = usePreCollabStore((s) => s.closeResultsPanel);
  const openTab = usePreCollabStore((s) => s.openResultsPanel);

  if (!isOpen) return null;

  return (
    <WorkspaceModal title="Pre-Collab Results" onClose={close}>
      <div className="flex flex-col h-full">
        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-v2-border bg-v2-surface shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => openTab(tab.id)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-v2-accent/15 text-v2-accent'
                  : 'text-v2-text-secondary hover:text-v2-text hover:bg-[var(--v2-channel-hover)]',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto v2-scrollbar">
          {activeTab === 'personas' && <PersonasTab />}
          {activeTab === 'criteria' && <CriteriaTab />}
          {activeTab === 'prompt' && <PromptTab />}
        </div>
      </div>
    </WorkspaceModal>
  );
}
