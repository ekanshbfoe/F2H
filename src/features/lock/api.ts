import { CryptoError, fromBase64, localWrap, toBase64, zero } from '@/crypto';
import { wipeLocalState } from '@/features/auth/session';
import { SecureKeys, secureGet, secureSet } from '@/services/secure-store';
import { supabase } from '@/services/supabase';
import { useSession } from '@/state/session.store';

import { monotonicNow, remainingCooldownMs, useLock } from './lock.store';
import {
  MAX_FAILURES,
  NO_ATTEMPTS,
  pinProblem,
  scheduleFor,
  type PinProblem,
  type UnlockResult,
  type WipeReason,
} from './model';
import { readAttempts, readLocalWrap, writeAttempts } from './storage';

export class LockError extends Error {
  constructor(
    readonly code: 'weak_pin' | 'not_unlocked' | 'locked' | 'busy' | 'no_pin',
    readonly problem: PinProblem | null = null,
  ) {
    super(code);
    this.name = 'LockError';
  }
}

/**
 * Boot: decides from local storage alone whether a PIN gate stands in front of everything
 * (AC-2, offline), whether a stored tenth miss wipes at once (AC-5), or whether there is no PIN.
 */
export async function loadLockState(): Promise<'none' | 'locked' | 'wiped'> {
  const lock = useLock.getState();
  const [local, attempts] = await Promise.all([readLocalWrap(), readAttempts()]);
  if (!local) {
    lock.set({ state: 'no_pin', failures: 0, cooldownMs: 0 });
    return 'none';
  }
  if (attempts.failures >= MAX_FAILURES) {
    await wipe('pin_limit');
    return 'wiped';
  }
  if (attempts.remainingMs > 0) startCooldown(attempts.remainingMs, attempts.failures);
  else lock.set({ state: 'locked', failures: attempts.failures, cooldownMs: 0 });
  return 'locked';
}

/** Derives and writes a new wrap for `mk`; the wrap lands before the owner so a kill between them reads as "no PIN". */
async function writeWrap(pin: string, mk: Uint8Array, ownerId: string): Promise<void> {
  let [saltB64, secretB64] = await Promise.all([
    secureGet(SecureKeys.deviceSalt),
    secureGet(SecureKeys.deviceSecret),
  ]);
  if (!saltB64 || !secretB64) {
    // Generated once per install (spec 0002); Change PIN never reaches this branch.
    saltB64 = toBase64(localWrap.generateDeviceSalt());
    secretB64 = toBase64(localWrap.generateDeviceSecret());
    await secureSet(SecureKeys.deviceSalt, saltB64);
    await secureSet(SecureKeys.deviceSecret, secretB64);
  }
  const wrapKey = await localWrap.deriveLocalWrapKey(
    pin,
    fromBase64(saltB64),
    fromBase64(secretB64),
  );
  let wrapped: Uint8Array;
  try {
    wrapped = localWrap.wrapMkLocal(wrapKey, mk, ownerId);
  } finally {
    zero(wrapKey);
  }
  await writeAttempts(NO_ATTEMPTS);
  await secureSet(SecureKeys.mkWrappedLocal, toBase64(wrapped));
  await secureSet(SecureKeys.lockOwner, ownerId);
  zero(wrapped);
}

/** Set PIN (AC-1, AC-15): wraps the in memory Master Key for the signed in account. */
export async function setPin(pin: string): Promise<void> {
  const problem = pinProblem(pin);
  if (problem) throw new LockError('weak_pin', problem);
  const s = useSession.getState();
  const lock = useLock.getState();
  if (!s.mk || !s.profile) throw new LockError('not_unlocked');
  if (lock.busy) throw new LockError('busy');
  const previous = lock.state;
  const generation = lock.generation;
  lock.set({ state: 'setting', busy: true });
  try {
    await writeWrap(pin, s.mk, s.profile.id);
    if (useLock.getState().generation !== generation) throw new LockError('locked');
    lock.set({ state: 'unlocked', failures: 0, cooldownMs: 0 });
  } catch (error) {
    lock.set({ state: previous === 'setting' ? 'no_pin' : previous });
    throw error;
  } finally {
    useLock.getState().set({ busy: false });
  }
}

type GateResult =
  | { kind: 'ok'; mk: Uint8Array }
  | Extract<UnlockResult, { kind: 'wrong_pin' | 'cooling_down' | 'wiped' }>;

/**
 * The attempt gate (AC-4, AC-5): the next miss is written before the derivation runs, so a kill
 * mid derivation still costs the guess; a success resets the entry; the tenth miss wipes.
 */
async function runGate(pin: string): Promise<GateResult> {
  const lock = useLock.getState();
  const owed = remainingCooldownMs(lock);
  if (owed > 0) return { kind: 'cooling_down', remainingMs: owed };
  if (lock.busy) throw new LockError('busy');
  lock.set({ busy: true });
  try {
    const [local, attempts] = await Promise.all([readLocalWrap(), readAttempts()]);
    if (!local) throw new LockError('no_pin');
    const next = {
      failures: attempts.failures + 1,
      remainingMs: scheduleFor(attempts.failures + 1),
    };
    await writeAttempts(next);
    const wrapKey = await localWrap.deriveLocalWrapKey(
      pin,
      fromBase64(local.saltB64),
      fromBase64(local.secretB64),
    );
    let mk: Uint8Array | null = null;
    try {
      mk = localWrap.unwrapMkLocal(wrapKey, fromBase64(local.wrapB64), local.owner);
    } catch (e) {
      if (!(e instanceof CryptoError)) throw e;
    } finally {
      zero(wrapKey);
    }
    if (mk) {
      await writeAttempts(NO_ATTEMPTS);
      lock.set({ failures: 0, cooldownMs: 0 });
      return { kind: 'ok', mk };
    }
    if (next.failures >= MAX_FAILURES) {
      await wipe('pin_limit');
      return { kind: 'wiped' };
    }
    if (next.remainingMs > 0) {
      startCooldown(next.remainingMs, next.failures);
      return { kind: 'cooling_down', remainingMs: next.remainingMs };
    }
    lock.set({ failures: next.failures });
    return { kind: 'wrong_pin', failures: next.failures };
  } finally {
    useLock.getState().set({ busy: false });
  }
}

/**
 * Enters the wait after misses 5 to 9. Reached from an unlocked state (a wrong current PIN on
 * Change PIN) it locks first: a run of guesses on an open phone is not the owner.
 */
function startCooldown(ms: number, failures: number): void {
  if (useLock.getState().state === 'unlocked') lockNow();
  useLock.getState().set({
    state: 'cooling_down',
    cooldownMs: ms,
    cooldownStartedAt: monotonicNow(),
    failures,
  });
}

/** Persists the wait still owed (every countdown tick and on background, AC-4). */
export async function persistCooldown(): Promise<void> {
  const lock = useLock.getState();
  if (lock.state !== 'cooling_down') return;
  await writeAttempts({ failures: lock.failures, remainingMs: remainingCooldownMs(lock) });
}

/** The countdown reached zero: back to `locked` with the misses kept. */
export async function endCooldown(): Promise<void> {
  const lock = useLock.getState();
  if (lock.state !== 'cooling_down') return;
  lock.set({ state: 'locked', cooldownMs: 0 });
  await writeAttempts({ failures: lock.failures, remainingMs: 0 });
}

/** Unlock (AC-2): the Master Key returns to memory unless the lock generation moved meanwhile. */
export async function unlock(pin: string): Promise<UnlockResult> {
  const generation = useLock.getState().generation;
  const r = await runGate(pin);
  if (r.kind !== 'ok') return r;
  if (useLock.getState().generation !== generation) {
    zero(r.mk);
    return { kind: 'stale' };
  }
  useSession.getState().setMk(r.mk);
  useLock.getState().set({ state: 'unlocked', failures: 0, cooldownMs: 0 });
  return { kind: 'ok' };
}

/** The current PIN through the attempt gate without touching the session (Change PIN, AC-7). */
export async function verifyPin(pin: string): Promise<UnlockResult> {
  const r = await runGate(pin);
  if (r.kind !== 'ok') return r;
  zero(r.mk);
  return { kind: 'ok' };
}

/** Rewraps the in memory Master Key under a new PIN; the salt and the device secret stay (AC-7). */
export async function rewrapPin(next: string): Promise<void> {
  const problem = pinProblem(next);
  if (problem) throw new LockError('weak_pin', problem);
  const s = useSession.getState();
  if (!s.mk || !s.profile) throw new LockError('not_unlocked');
  const generation = useLock.getState().generation;
  await writeWrap(next, s.mk, s.profile.id);
  if (useLock.getState().generation !== generation) throw new LockError('locked');
}

/** Change PIN (AC-7) in one call: gate on the current PIN, then rewrap. */
export async function changePin(current: string, next: string): Promise<UnlockResult> {
  const problem = pinProblem(next);
  if (problem) throw new LockError('weak_pin', problem);
  const r = await verifyPin(current);
  if (r.kind !== 'ok') return r;
  await rewrapPin(next);
  return { kind: 'ok' };
}

/** Lock (AC-3): zero the Master Key, clear decrypted caches, bump the generation. */
export function lockNow(): void {
  const lock = useLock.getState();
  if (lock.state !== 'unlocked') return;
  useSession.getState().setMk(null);
  lock.bumpGeneration();
  lock.listeners.forEach((fn) => fn());
  lock.set({ state: 'locked' });
}

/**
 * Runs an operation on a copy of the Master Key (AC-16). The callback calls `assertLive()` right
 * before it commits a write; it throws `locked` when a lock or wipe happened since the copy.
 */
export async function withKey<T>(
  fn: (mk: Uint8Array, assertLive: () => void) => Promise<T>,
): Promise<T> {
  const mk = useSession.getState().mk;
  if (!mk) throw new LockError('locked');
  const generation = useLock.getState().generation;
  const copy = new Uint8Array(mk);
  const assertLive = () => {
    if (useLock.getState().generation !== generation) throw new LockError('locked');
  };
  try {
    return await fn(copy, assertLive);
  } finally {
    zero(copy);
  }
}

/**
 * Wipe (AC-5, AC-6, AC-10): tell the server first on a best effort basis, then clear every local
 * secret and marker, end the session and show the Wiped screen with the reason's copy.
 */
export async function wipe(reason: WipeReason): Promise<void> {
  const s = useSession.getState();
  const deviceId = s.deviceId ?? (await secureGet(SecureKeys.deviceId));
  if (reason !== 'revoked' && deviceId) {
    try {
      await supabase.rpc('revoke_my_device', { p_device_id: deviceId });
    } catch {
      // offline or already closed: the local wipe still happens
    }
  }
  await wipeLocalState('signed_out');
  useLock.getState().set({ state: 'wiped', wipeReason: reason });
}

/**
 * Reads this device's row (own row readable) and wipes on a closed status (AC-10). A transient
 * error or an invisible row changes nothing; only a definitive answer does.
 */
export async function checkDeviceStatus(): Promise<void> {
  const s = useSession.getState();
  const deviceId = s.deviceId ?? (await secureGet(SecureKeys.deviceId));
  if (!deviceId) return;
  const { data, error } = await supabase
    .from('devices')
    .select('status')
    .eq('id', deviceId)
    .maybeSingle();
  if (error || !data) return;
  s.setDevice(deviceId, data.status);
  if (data.status === 'revoked' || data.status === 'rejected' || data.status === 'expired') {
    await wipe('revoked');
  }
}
