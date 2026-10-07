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
 * Target hardware is an 8 year old budget Android phone with 1 GB of RAM running Hermes in
 * Expo Go. Pure JS scrypt there is about 60 times slower than Node, so the default is N=2^7
 * (128 KiB), set on 2026-10-07 to keep the daily PIN unlock near 1.3 s on that phone.
 *
 * Security note: at 2^7 the stretch is cheap for an offline guess, so the real protection of
 * the cloud copy is the device approval gate (key material is unreadable without an approved
 * device), the Supabase bcrypt of the auth secret, and a long passphrase. The local PIN wrap
 * additionally needs the 256 bit device secret from the hardware keystore. Raise N again when
 * a dev build adopts native crypto. Follow up for /architect: a stronger separate parameter set
 * for the rare password login, keeping this one for the daily PIN.
 *
 * Recorded timings (`scripts/bench-kdf.ts`, and the "Crypto bench" card in the dev gallery):
 * - Node 24 on the dev machine (2026-10-07): N=2^10 about 9 ms, N=2^14 about 137 ms.
 * - 8 year old 1 GB Android phone, Hermes, Expo Go (2026-10-07): N=2^9 5206 ms, N=2^10 7965 ms,
 *   N=2^11 15689 ms, N=2^12 30743 ms; so N=2^7 is about 1.3 s and N=2^8 about 2.5 s.
 *
 * Argon2id is not used because pure JS argon2 is too slow on Hermes; this module is the only
 * place to change if a native build adopts it.
 */
export const SCRYPT_DEFAULT: Readonly<ScryptParams> = Object.freeze({
  N: 2 ** 7,
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
