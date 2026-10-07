import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

import { asBytes, concat } from './encoding';
import { assertLength, CryptoError } from './errors';
import { randomBytes } from './random';

/** Wire format: `0x01 || nonce(24) || ciphertext+tag`. */
export const AEAD_VERSION = 0x01;
export const KEY_LEN = 32;
export const NONCE_LEN = 24;
export const TAG_LEN = 16;
const HEADER_LEN = 1 + NONCE_LEN;

/** Encrypts with a fresh random nonce. Every call must carry an AAD (spec invariant). */
export function seal(key: Uint8Array, plaintext: Uint8Array, aad: string | Uint8Array): Uint8Array {
  return sealWithNonce(key, randomBytes(NONCE_LEN), plaintext, aad);
}

/**
 * Deterministic variant used only to reproduce test vectors. Never call it with a nonce that
 * is not fresh and random; `index.ts` does not export it.
 */
export function sealWithNonce(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  aad: string | Uint8Array,
): Uint8Array {
  assertLength(key, KEY_LEN, 'key');
  assertLength(nonce, NONCE_LEN, 'nonce');
  const ct = xchacha20poly1305(key, nonce, asBytes(aad)).encrypt(plaintext);
  return concat(new Uint8Array([AEAD_VERSION]), nonce, ct);
}

/** Decrypts a wire value; throws `CryptoError` on a bad version, a short input or a failed tag. */
export function open(key: Uint8Array, wire: Uint8Array, aad: string | Uint8Array): Uint8Array {
  assertLength(key, KEY_LEN, 'key');
  if (wire.length < HEADER_LEN + TAG_LEN)
    throw new CryptoError('bad_length', 'ciphertext too short');
  if (wire[0] !== AEAD_VERSION) throw new CryptoError('bad_version', 'unknown ciphertext version');
  const nonce = wire.subarray(1, HEADER_LEN);
  const ct = wire.subarray(HEADER_LEN);
  try {
    return xchacha20poly1305(key, nonce, asBytes(aad)).decrypt(ct);
  } catch {
    throw new CryptoError('auth_failed', 'ciphertext authentication failed');
  }
}
