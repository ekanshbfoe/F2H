import { AppKeys, appDelete, appGet, appSet } from '@/services/app-storage';
import { SecureKeys, secureDelete, secureGet, secureSet } from '@/services/secure-store';

import {
  DEFAULT_TIMEOUT_MS,
  isTimeoutOption,
  parseAttempts,
  serializeAttempts,
  type AttemptEntry,
} from './model';

/**
 * The lock's own entries in SecureStore and AsyncStorage. No crypto here, no session: this file
 * is imported by the auth slice (sign out forgets the PIN) so it must not import `./api`.
 */

export interface LocalWrap {
  owner: string;
  wrapB64: string;
  saltB64: string;
  secretB64: string;
}

/** The three SecureStore reads an unlock needs, in parallel (AC-13), plus the owner. */
export async function readLocalWrap(): Promise<LocalWrap | null> {
  const [owner, wrapB64, saltB64, secretB64] = await Promise.all([
    secureGet(SecureKeys.lockOwner),
    secureGet(SecureKeys.mkWrappedLocal),
    secureGet(SecureKeys.deviceSalt),
    secureGet(SecureKeys.deviceSecret),
  ]);
  if (!owner || !wrapB64 || !saltB64 || !secretB64) return null;
  return { owner, wrapB64, saltB64, secretB64 };
}

/** Whether this phone holds a PIN wrap for exactly this account (AC-14 owner binding). */
export async function hasPinFor(ownerId: string): Promise<boolean> {
  const [owner, wrap] = await Promise.all([
    secureGet(SecureKeys.lockOwner),
    secureGet(SecureKeys.mkWrappedLocal),
  ]);
  return owner === ownerId && wrap !== null;
}

export async function readAttempts(): Promise<AttemptEntry> {
  return parseAttempts(await secureGet(SecureKeys.lockAttempts));
}

export async function writeAttempts(entry: AttemptEntry): Promise<void> {
  await secureSet(SecureKeys.lockAttempts, serializeAttempts(entry));
}

/** Sign out: the wrap, the attempts and the owner go; the device identity stays (AC-14). */
export async function forgetPin(): Promise<void> {
  await Promise.all([
    secureDelete(SecureKeys.mkWrappedLocal),
    secureDelete(SecureKeys.lockAttempts),
    secureDelete(SecureKeys.lockOwner),
  ]);
}

export async function readTimeoutMs(): Promise<number> {
  const raw = await appGet(AppKeys.lockTimeoutMs);
  const ms = raw === null ? NaN : Number(raw);
  return isTimeoutOption(ms) ? ms : DEFAULT_TIMEOUT_MS;
}

export async function writeTimeoutMs(ms: number): Promise<void> {
  if (!isTimeoutOption(ms)) throw new Error('not a timeout option');
  await appSet(AppKeys.lockTimeoutMs, String(ms));
}

export async function readBackgroundAt(): Promise<number | null> {
  const raw = await appGet(AppKeys.backgroundAt);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function writeBackgroundAt(at: number | null): Promise<void> {
  if (at === null) await appDelete(AppKeys.backgroundAt);
  else await appSet(AppKeys.backgroundAt, String(at));
}
