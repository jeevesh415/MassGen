import { V2TimelineView } from './V2TimelineView';
import { useWorkspaceModalStore } from '../../../stores/v2/workspaceModalStore';

export function TimelineTile() {
  const openModal = useWorkspaceModalStore((s) => s.open);

  return (
    <div className="h-full overflow-auto v2-scrollbar bg-v2-base">
      <V2TimelineView
        onNodeClick={(node) => {
          if (node.type === 'answer' || node.type === 'final') {
            // Open answers tab focused on this answer's label
            openModal('answers', node.label);
          } else if (node.type === 'vote') {
            // Open votes tab
            openModal('answers');
          }
        }}
      />
    </div>
  );
}
