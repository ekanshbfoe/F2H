import { hkdf as nobleHkdf } from '@noble/hashes/hkdf.js';
import { scrypt as nobleScrypt, scryptAsync as nobleScryptAsync } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { asBytes } from './encoding';

export interface ScryptParams {
  /** CPU and memory cost, a power of two. Memory used is about 128 * N * r bytes. */
  N: number;
  r: number;
  p: number;
  dkLen: number;
}

/**
 * Default scrypt parameters for the password split and the local PIN wrap.
 *
 * Recorded timings (`scripts/bench-kdf.ts`, and the "Crypto bench" card in the dev gallery):
 * - Node 24 on the dev machine (2026-10-07): N=2^13 93 ms, N=2^14 137 ms, N=2^15 251 ms, N=2^16 453 ms.
 * - Mid range Android phone, Hermes, Expo Go: fill in from the gallery bench (AC-12).
 *
 * 2^14 with r=8 uses 16 MiB, the ceiling that stays comfortable in Expo Go. Argon2id is not used
 * because pure JS argon2 is too slow on Hermes; this module is the only place to change if a
 * native build adopts it.
 */
export const SCRYPT_DEFAULT: Readonly<ScryptParams> = Object.freeze({
  N: 2 ** 14,
  r: 8,
  p: 1,
  dkLen: 32,
});

export function scrypt(
  password: string | Uint8Array,
  salt: string | Uint8Array,
  params: ScryptParams = SCRYPT_DEFAULT,
): Uint8Array {
  return nobleScrypt(asBytes(password), asBytes(salt), params);
}

/** Same result as `scrypt`, but yields to the event loop so the UI stays responsive. */
export function scryptAsync(
  password: string | Uint8Array,
  salt: string | Uint8Array,
  params: ScryptParams = SCRYPT_DEFAULT,
): Promise<Uint8Array> {
  return nobleScryptAsync(asBytes(password), asBytes(salt), params);
}

export function hkdf(
  ikm: Uint8Array,
  salt: string | Uint8Array,
  info: string | Uint8Array,
  length = 32,
): Uint8Array {
  return nobleHkdf(sha256, ikm, asBytes(salt), asBytes(info), length);
}
