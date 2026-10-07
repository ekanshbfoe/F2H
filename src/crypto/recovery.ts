import { x25519 } from '@noble/curves/ed25519.js';

import type { Keypair } from './box';
import { toHex } from './encoding';
import { assertLength } from './errors';
import { sha256 } from './hash';
import { hkdf } from './kdf';
import { randomBytes } from './random';

export const SEED_LEN = 32;

export function generateSeed(): Uint8Array {
  return randomBytes(SEED_LEN);
}

/**
 * Admin recovery keypair from the 32 byte seed behind the paper kit:
 * `priv = hkdf(seed, salt "f2h:recovery", info "f2h:recovery-x25519:v1")`, clamped by X25519.
 */
export function deriveRecoveryKeypair(seed: Uint8Array): Keypair {
  assertLength(seed, SEED_LEN, 'recovery seed');
  const secretKey = hkdf(seed, 'f2h:recovery', 'f2h:recovery-x25519:v1', 32);
  return { publicKey: x25519.getPublicKey(secretKey), secretKey };
}

/** First 8 bytes of sha256(public key) as 4 groups of 4 hex chars, e.g. `3f2a 91c0 7b44 e1d9`. */
export function fingerprint(publicKey: Uint8Array): string {
  const hex = toHex(sha256(publicKey).subarray(0, 8));
  return [hex.slice(0, 4), hex.slice(4, 8), hex.slice(8, 12), hex.slice(12, 16)].join(' ');
}
