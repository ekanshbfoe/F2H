import { x25519 } from '@noble/curves/ed25519.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

import { NONCE_LEN, TAG_LEN } from './aead';
import { concat } from './encoding';
import { assertLength, CryptoError } from './errors';
import { hkdf } from './kdf';
import { randomBytes } from './random';

/** Wire format: `0x01 || eph_pub(32) || nonce(24) || ciphertext+tag`. */
export const BOX_VERSION = 0x01;
export const PUBLIC_KEY_LEN = 32;
export const SECRET_KEY_LEN = 32;
const BOX_INFO = 'f2h:sealed-box:v1';
const HEADER_LEN = 1 + PUBLIC_KEY_LEN + NONCE_LEN;

export interface Keypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function generateKeypair(): Keypair {
  const secretKey = x25519.utils.randomSecretKey();
  return { publicKey: x25519.getPublicKey(secretKey), secretKey };
}

export function publicKeyOf(secretKey: Uint8Array): Uint8Array {
  assertLength(secretKey, SECRET_KEY_LEN, 'secret key');
  return x25519.getPublicKey(secretKey);
}

function deriveBoxKey(ephSecret: Uint8Array, ephPub: Uint8Array, recipientPub: Uint8Array) {
  const shared = x25519.getSharedSecret(ephSecret, recipientPub);
  const salt = concat(ephPub, recipientPub);
  return { key: hkdf(shared, salt, BOX_INFO, 32), aad: salt };
}

/** Seals `plaintext` so only the holder of the matching secret key can open it. */
export function seal(recipientPub: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return sealWith(recipientPub, plaintext, x25519.utils.randomSecretKey(), randomBytes(NONCE_LEN));
}

/** Deterministic variant for test vectors only; not exported from `index.ts`. */
export function sealWith(
  recipientPub: Uint8Array,
  plaintext: Uint8Array,
  ephSecret: Uint8Array,
  nonce: Uint8Array,
): Uint8Array {
  assertLength(recipientPub, PUBLIC_KEY_LEN, 'recipient public key');
  assertLength(ephSecret, SECRET_KEY_LEN, 'ephemeral secret key');
  assertLength(nonce, NONCE_LEN, 'nonce');
  const ephPub = x25519.getPublicKey(ephSecret);
  const { key, aad } = deriveBoxKey(ephSecret, ephPub, recipientPub);
  const ct = xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
  return concat(new Uint8Array([BOX_VERSION]), ephPub, nonce, ct);
}

export function open(recipientSecret: Uint8Array, wire: Uint8Array): Uint8Array {
  assertLength(recipientSecret, SECRET_KEY_LEN, 'recipient secret key');
  if (wire.length < HEADER_LEN + TAG_LEN)
    throw new CryptoError('bad_length', 'sealed box too short');
  if (wire[0] !== BOX_VERSION) throw new CryptoError('bad_version', 'unknown sealed box version');
  const ephPub = wire.subarray(1, 1 + PUBLIC_KEY_LEN);
  const nonce = wire.subarray(1 + PUBLIC_KEY_LEN, HEADER_LEN);
  const ct = wire.subarray(HEADER_LEN);
  const recipientPub = x25519.getPublicKey(recipientSecret);
  const shared = x25519.getSharedSecret(recipientSecret, ephPub);
  const salt = concat(ephPub, recipientPub);
  const key = hkdf(shared, salt, BOX_INFO, 32);
  try {
    return xchacha20poly1305(key, nonce, salt).decrypt(ct);
  } catch {
    throw new CryptoError('auth_failed', 'sealed box authentication failed');
  }
}
