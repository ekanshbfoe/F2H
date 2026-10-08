import { create } from 'zustand';

import type { LockState, WipeReason } from './model';

type LockListener = () => void;

interface LockStoreState {
  state: LockState;
  /** Bumped on every lock and wipe; a vault write from an older generation aborts (AC-16). */
  generation: number;
  failures: number;
  /** Wait still owed while `cooling_down`, in ms, as of `cooldownStartedAt`. */
  cooldownMs: number;
  /** Monotonic timestamp (`performance.now()`) when the current cooldown began. */
  cooldownStartedAt: number;
  wipeReason: WipeReason | null;
  /** True while a PIN derivation runs (the screens show progress and refuse a second guess). */
  busy: boolean;
  set: (patch: Partial<Omit<LockStoreState, 'set' | 'bumpGeneration' | 'onLock'>>) => void;
  bumpGeneration: () => number;
  /** Decrypted caches register here and clear themselves on every lock (AC-3). */
  onLock: (listener: LockListener) => () => void;
  listeners: Set<LockListener>;
}

export const useLock = create<LockStoreState>((set, get) => ({
  state: 'no_pin',
  generation: 0,
  failures: 0,
  cooldownMs: 0,
  cooldownStartedAt: 0,
  wipeReason: null,
  busy: false,
  listeners: new Set(),
  set: (patch) => set(patch),
  bumpGeneration: () => {
    const generation = get().generation + 1;
    set({ generation });
    return generation;
  },
  onLock: (listener) => {
    get().listeners.add(listener);
    return () => {
      get().listeners.delete(listener);
    };
  },
}));

/** A monotonic clock the wall clock cannot move (AC-4). */
export function monotonicNow(): number {
  const p = globalThis.performance;
  return p && typeof p.now === 'function' ? p.now() : Date.now();
}

/** The wait still owed right now while cooling down, 0 otherwise. */
export function remainingCooldownMs(
  s: Pick<LockStoreState, 'state' | 'cooldownMs' | 'cooldownStartedAt'>,
  now = monotonicNow(),
): number {
  if (s.state !== 'cooling_down') return 0;
  return Math.max(0, s.cooldownMs - (now - s.cooldownStartedAt));
}
