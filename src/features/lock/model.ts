/** App lock rules (spec 0002): the backoff schedule, the PIN rules and the stored attempt entry. */

export const PIN_LENGTH = 6;
export const MAX_FAILURES = 10;

/** Wait owed after the n-th consecutive miss, in ms. Misses 1 to 4 are free; the tenth wipes. */
export const BACKOFF_MS: readonly number[] = [
  0, 0, 0, 0, 30_000, 60_000, 120_000, 300_000, 900_000,
];

export function scheduleFor(failures: number): number {
  if (failures <= 0) return 0;
  return BACKOFF_MS[failures - 1] ?? 0;
}

export const TIMEOUT_OPTIONS = [
  { ms: 15_000, label: '15 s' },
  { ms: 60_000, label: '1 min' },
  { ms: 300_000, label: '5 min' },
  { ms: 900_000, label: '15 min' },
] as const;
export const DEFAULT_TIMEOUT_MS = 60_000;

export function isTimeoutOption(ms: number): boolean {
  return TIMEOUT_OPTIONS.some((o) => o.ms === ms);
}

/** AC-15: six digits, not all the same, not a straight run up or down. */
export type PinProblem = 'length' | 'repeated' | 'sequence';

export function pinProblem(pin: string): PinProblem | null {
  if (!/^\d{6}$/.test(pin)) return 'length';
  const digits = [...pin].map(Number);
  if (digits.every((d) => d === digits[0])) return 'repeated';
  const up = digits.every((d, i) => i === 0 || d === (digits[i - 1] ?? 0) + 1);
  const down = digits.every((d, i) => i === 0 || d === (digits[i - 1] ?? 0) - 1);
  if (up || down) return 'sequence';
  return null;
}

export function describePinProblem(problem: PinProblem): string {
  switch (problem) {
    case 'length':
      return 'Use exactly six digits.';
    case 'repeated':
      return 'All six digits are the same. Pick something harder to guess.';
    case 'sequence':
      return 'That is a straight run like 123456. Pick something harder to guess.';
  }
}

export interface AttemptEntry {
  failures: number;
  remainingMs: number;
}

export const NO_ATTEMPTS: AttemptEntry = { failures: 0, remainingMs: 0 };

export function parseAttempts(raw: string | null): AttemptEntry {
  if (!raw) return NO_ATTEMPTS;
  try {
    const v = JSON.parse(raw) as Partial<AttemptEntry>;
    const failures = Number.isFinite(v.failures) ? Math.max(0, Math.floor(v.failures ?? 0)) : 0;
    const remainingMs = Number.isFinite(v.remainingMs) ? Math.max(0, v.remainingMs ?? 0) : 0;
    return { failures, remainingMs };
  } catch {
    // Unreadable means tampered or corrupt: the conservative reading is the worst case.
    return { failures: MAX_FAILURES, remainingMs: 0 };
  }
}

export function serializeAttempts(entry: AttemptEntry): string {
  return JSON.stringify({ failures: entry.failures, remainingMs: Math.ceil(entry.remainingMs) });
}

/** AC-3: lock when the app was away longer than the timeout. A missing marker never locks. */
export function shouldLock(backgroundAt: number | null, now: number, timeoutMs: number): boolean {
  if (backgroundAt === null || !Number.isFinite(backgroundAt)) return false;
  return now - backgroundAt > timeoutMs;
}

export type LockState = 'no_pin' | 'setting' | 'unlocked' | 'locked' | 'cooling_down' | 'wiped';
export type WipeReason = 'pin_limit' | 'forgot' | 'revoked';

export type UnlockResult =
  | { kind: 'ok' }
  | { kind: 'wrong_pin'; failures: number }
  | { kind: 'cooling_down'; remainingMs: number }
  | { kind: 'wiped' }
  | { kind: 'stale' };

export function describeWipe(reason: WipeReason | string | undefined): {
  title: string;
  body: string;
} {
  switch (reason) {
    case 'forgot':
      return {
        title: 'PIN forgotten',
        body: 'This phone forgot its key material. Log in with your password and ask the Admin to approve it again.',
      };
    case 'revoked':
      return {
        title: 'Access removed',
        body: 'The Admin removed this phone from the family vault. Nothing from the vault is stored here any more. Log in again if you need it back.',
      };
    case 'pin_limit':
    default:
      return {
        title: 'Too many wrong PINs',
        body: 'After ten wrong PINs this phone wiped its key material and told the Admin. Log in with your password and ask the Admin to approve it again.',
      };
  }
}
