/**
 * The umbrella sealed box, server side (spec 0006, AC-2): `0x01 || eph_pub(32) || nonce(24) || ct`
 * with `key = hkdf_sha256(x25519(eph_sk, recipient_pub), salt = eph_pub || recipient_pub,
 * info = "f2h:sealed-box:v1")` and AAD `eph_pub || recipient_pub`. Mirrors `src/crypto/box.ts`;
 * the backup tests open a server sealed box with the app's `box.open`.
 */
import { xchacha20poly1305 } from 'npm:@noble/ciphers@2.4.0/chacha.js';
import { x25519 } from 'npm:@noble/curves@2.4.0/ed25519.js';
import { hkdf } from 'npm:@noble/hashes@2.4.0/hkdf.js';
import { sha256 } from 'npm:@noble/hashes@2.4.0/sha2.js';

const INFO = new TextEncoder().encode('f2h:sealed-box:v1');
export const BOX_VERSION = 0x01;

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** `ephSecret` and `nonce` are injected only by the vector test. */
export function seal(
  recipientPub: Uint8Array,
  plaintext: Uint8Array,
  ephSecret: Uint8Array = x25519.utils.randomSecretKey(),
  nonce: Uint8Array = crypto.getRandomValues(new Uint8Array(24)),
): Uint8Array {
  if (recipientPub.length !== 32) throw new Error('recipient public key must be 32 bytes');
  const ephPub = x25519.getPublicKey(ephSecret);
  const shared = x25519.getSharedSecret(ephSecret, recipientPub);
  const salt = concat(ephPub, recipientPub);
  const key = hkdf(sha256, shared, salt, INFO, 32);
  try {
    const ct = xchacha20poly1305(key, nonce, salt).encrypt(plaintext);
    return concat(new Uint8Array([BOX_VERSION]), ephPub, nonce, ct);
  } finally {
    shared.fill(0);
    key.fill(0);
    ephSecret.fill(0);
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return Array.from(sha256(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
