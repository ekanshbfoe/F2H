/**
 * Admin challenge tag, server side (spec 0001-admin-device-self-approval, AC-2). Mirrors
 * `src/crypto/challenge.ts` byte for byte; `src/crypto/__tests__/vectors.json` pins both.
 *
 * `tag = hkdf_sha256(ikm = x25519(eph_sk, recovery_pub), salt = eph_pub || recovery_pub || device_id,
 *        info = "f2h:admin-challenge:v1", 32)`; only `sha256(tag)` is stored, the secret is dropped.
 */
import { x25519 } from 'npm:@noble/curves@2.4.0/ed25519.js';
import { hkdf } from 'npm:@noble/hashes@2.4.0/hkdf.js';
import { sha256 } from 'npm:@noble/hashes@2.4.0/sha2.js';

export const CHALLENGE_INFO = 'f2h:admin-challenge:v1';
export const CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 3;
export const MAX_CHALLENGES = 5;
export const TAG_LEN = 32;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error('not hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** PostgREST returns `bytea` as `\x` followed by hex. */
export function byteaToBytes(value: string): Uint8Array {
  return hexToBytes(value.startsWith('\\x') ? value.slice(2) : value);
}

export function uuidToBytes(uuid: string): Uint8Array {
  if (!UUID_RE.test(uuid)) throw new Error('not a uuid');
  return hexToBytes(uuid.replace(/-/g, '').toLowerCase());
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** The tag both ends compute. `shared` is zeroed before returning. */
export function computeTag(
  shared: Uint8Array,
  ephPub: Uint8Array,
  recoveryPub: Uint8Array,
  deviceId: string,
): Uint8Array {
  try {
    return hkdf(
      sha256,
      shared,
      concat(ephPub, recoveryPub, uuidToBytes(deviceId)),
      new TextEncoder().encode(CHALLENGE_INFO),
      TAG_LEN,
    );
  } finally {
    shared.fill(0);
  }
}

export interface IssuedChallenge {
  /** goes to the phone */
  ephPub: Uint8Array;
  /** goes to the row; the tag itself and the ephemeral secret are gone when this returns */
  tagHash: string;
}

/** One challenge for this pending device. `ephSecret` is only injected by the vector test. */
export function issueChallenge(
  recoveryPub: Uint8Array,
  deviceId: string,
  ephSecret: Uint8Array = x25519.utils.randomSecretKey(),
): IssuedChallenge {
  if (recoveryPub.length !== 32) throw new Error('recovery public key must be 32 bytes');
  try {
    const ephPub = x25519.getPublicKey(ephSecret);
    const tag = computeTag(
      x25519.getSharedSecret(ephSecret, recoveryPub),
      ephPub,
      recoveryPub,
      deviceId,
    );
    const tagHash = bytesToHex(sha256(tag));
    tag.fill(0);
    return { ephPub, tagHash };
  } finally {
    ephSecret.fill(0);
  }
}

/** sha256 of the tag the phone sent, hex, for the constant time compare inside the RPC. */
export function tagHashOf(tag: Uint8Array): string {
  return bytesToHex(sha256(tag));
}
