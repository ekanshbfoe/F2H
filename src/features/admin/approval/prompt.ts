import { create } from 'zustand';

import type { MemberDevice } from '../api';

interface PromptState {
  /** The request the approval sheet is showing, wherever in the app it was opened from. */
  device: MemberDevice | null;
  /** Requests already shown once this session: closing one does not make it pop up again. */
  seen: string[];
  show: (device: MemberDevice) => void;
  close: () => void;
}

/** The one approval sheet in the app, opened from the Approvals list or by a new sign in. */
export const useApprovalPrompt = create<PromptState>((set) => ({
  device: null,
  seen: [],
  show: (device) =>
    set((s) => ({
      device,
      seen: device.id && !s.seen.includes(device.id) ? [...s.seen, device.id] : s.seen,
    })),
  close: () => set({ device: null }),
}));
