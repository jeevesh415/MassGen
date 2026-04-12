import { create } from 'zustand';

export type WorkspaceModalView = 'files' | 'answers' | 'timeline' | null;

interface WorkspaceModalState {
  activeView: WorkspaceModalView;
  /** For answers view: which answer to auto-expand */
  focusAnswerLabel: string | null;
}

interface WorkspaceModalActions {
  open: (view: Exclude<WorkspaceModalView, null>, focusAnswer?: string) => void;
  close: () => void;
  toggle: (view: Exclude<WorkspaceModalView, null>) => void;
}

export const useWorkspaceModalStore = create<WorkspaceModalState & WorkspaceModalActions>(
  (set, get) => ({
    activeView: null,
    focusAnswerLabel: null,

    open: (view, focusAnswer) => set({ activeView: view, focusAnswerLabel: focusAnswer || null }),
    close: () => set({ activeView: null, focusAnswerLabel: null }),
    toggle: (view) => {
      const current = get().activeView;
      if (current === view) {
        set({ activeView: null, focusAnswerLabel: null });
      } else {
        set({ activeView: view, focusAnswerLabel: null });
      }
    },
  })
);
