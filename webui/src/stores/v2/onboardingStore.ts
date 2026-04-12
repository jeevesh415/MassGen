/**
 * Onboarding Store
 *
 * Manages guided onboarding state for skill-triggered setup flows.
 * When the wizard is launched from a skill invocation (?skill=1 URL param),
 * guided tips and a welcome step are shown to walk the user through setup.
 */

import { create } from 'zustand';

interface OnboardingState {
  /** True when launched from a skill invocation (?skill=1) */
  isSkillOnboarding: boolean;
  /** True while guided tips should be visible */
  isOnboardingActive: boolean;
  /** Tips the user has dismissed */
  dismissedTips: Set<string>;

  /** Read ?skill=1 from URL and initialize state */
  initFromUrl: () => void;
  /** Dismiss a specific tip by ID */
  dismissTip: (tipId: string) => void;
  /** Mark onboarding as complete (hides all tips) */
  completeOnboarding: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  isSkillOnboarding: false,
  isOnboardingActive: false,
  dismissedTips: new Set(),

  initFromUrl: () => {
    const params = new URLSearchParams(window.location.search);
    const isSkill = params.get('skill') === '1';
    set({
      isSkillOnboarding: isSkill,
      isOnboardingActive: isSkill,
      dismissedTips: new Set(),
    });
  },

  dismissTip: (tipId: string) =>
    set((state) => ({
      dismissedTips: new Set([...state.dismissedTips, tipId]),
    })),

  completeOnboarding: () =>
    set({ isOnboardingActive: false }),
}));
