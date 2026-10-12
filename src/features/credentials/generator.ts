import { randomBytes } from '@/crypto';

/**
 * Password generator (spec 0004, AC-3). Every index is drawn by rejection sampling over secure
 * random bytes, so no character is favoured; one character of each enabled set is placed first,
 * the rest come from the union, then a Fisher Yates shuffle hides where the forced ones sit.
 */

export const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!#$%&*+-=?@^_~',
} as const;
export type SetName = keyof typeof SETS;

export const MIN_LENGTH = 12;
export const MAX_LENGTH = 64;
export const DEFAULT_LENGTH = 20;

export interface GeneratorOptions {
  length: number;
  sets: Record<SetName, boolean>;
}

export const DEFAULT_OPTIONS: GeneratorOptions = {
  length: DEFAULT_LENGTH,
  sets: { lower: true, upper: true, digits: true, symbols: true },
};

type Source = (n: number) => Uint8Array;

/** An unbiased integer in [0, n) for n ≤ 256. */
export function randomIndex(n: number, source: Source = randomBytes): number {
  if (n < 1 || n > 256) throw new Error('range must be 1..256');
  const limit = 256 - (256 % n);
  for (;;) {
    const b = source(1)[0] ?? 0;
    if (b < limit) return b % n;
  }
}

export function enabledSets(o: GeneratorOptions): string[] {
  return (Object.keys(SETS) as SetName[]).filter((k) => o.sets[k]).map((k) => SETS[k]);
}

export function generatePassword(o: GeneratorOptions, source: Source = randomBytes): string {
  const sets = enabledSets(o);
  if (sets.length === 0) throw new Error('enable at least one character set');
  const length = Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.round(o.length)));
  const union = sets.join('');
  const chars: string[] = sets.map((s) => s[randomIndex(s.length, source)] ?? '');
  while (chars.length < length) chars.push(union[randomIndex(union.length, source)] ?? '');
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1, source);
    [chars[i], chars[j]] = [chars[j] ?? '', chars[i] ?? ''];
  }
  return chars.join('');
}

/** `length × log2(union size)`, rounded down. */
export function strengthBits(o: GeneratorOptions): number {
  const size = enabledSets(o).join('').length;
  return size > 0 ? Math.floor(o.length * Math.log2(size)) : 0;
}

export function strengthLabel(bits: number): string {
  if (bits >= 100) return 'Very strong';
  if (bits >= 80) return 'Strong';
  if (bits >= 60) return 'Fair';
  return 'Weak';
}
