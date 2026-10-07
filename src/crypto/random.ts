import './polyfill';

import { toHex } from './encoding';

/** `n` cryptographically secure bytes from `globalThis.crypto` (expo-crypto on the phone). */
export function randomBytes(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0)
    throw new RangeError('randomBytes: n must be a non negative integer');
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** RFC 4122 version 4 UUID built from the same random source (contract 5 in spec 0001). */
export function randomUuid(): string {
  const b = randomBytes(16);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** 16 random bytes, the blob id format for files (contract 5 in spec 0001). */
export const randomBlobId = (): Uint8Array => randomBytes(16);
