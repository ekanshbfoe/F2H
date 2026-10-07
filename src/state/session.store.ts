import { create } from 'zustand';

import { zero } from '@/crypto';

/**
 * Where the app is in the gate. Secrets (KEK while waiting, MK once unlocked) live only here, in
 * memory, and are zeroed on sign out. The App lock feature adds the PIN path on top.
 */
export type SessionPhase =
  'booting' | 'signed_out' | 'pending' | 'first_run' | 'ready' | 'rejected' | 'expired';

export interface SessionProfile {
  id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'member';
  status: 'pending' | 'active' | 'suspended';
}

interface SessionState {
  phase: SessionPhase;
  profile: SessionProfile | null;
  deviceId: string | null;
  deviceStatus: string | null;
  kek: Uint8Array | null;
  mk: Uint8Array | null;
  setPhase: (phase: SessionPhase) => void;
  setProfile: (profile: SessionProfile | null) => void;
  setDevice: (id: string | null, status: string | null) => void;
  setKek: (kek: Uint8Array | null) => void;
  setMk: (mk: Uint8Array | null) => void;
  clearSecrets: () => void;
  reset: (phase?: SessionPhase) => void;
}

export const useSession = create<SessionState>((set, get) => ({
  phase: 'booting',
  profile: null,
  deviceId: null,
  deviceStatus: null,
  kek: null,
  mk: null,
  setPhase: (phase) => set({ phase }),
  setProfile: (profile) => set({ profile }),
  setDevice: (deviceId, deviceStatus) => set({ deviceId, deviceStatus }),
  setKek: (kek) => {
    const old = get().kek;
    if (old && old !== kek) zero(old);
    set({ kek });
  },
  setMk: (mk) => {
    const old = get().mk;
    if (old && old !== mk) zero(old);
    set({ mk });
  },
  clearSecrets: () => {
    const { kek, mk } = get();
    if (kek) zero(kek);
    if (mk) zero(mk);
    set({ kek: null, mk: null });
  },
  reset: (phase = 'signed_out') => {
    get().clearSecrets();
    set({ phase, profile: null, deviceId: null, deviceStatus: null });
  },
}));
