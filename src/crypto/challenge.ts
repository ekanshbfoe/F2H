import { x25519 } from '@noble/curves/ed25519.js';

import { PUBLIC_KEY_LEN, SECRET_KEY_LEN } from './box';
import { concat, fromHex, zero } from './encoding';
import { assertLength, CryptoError } from './errors';
import { hkdf } from './kdf';

/**
 * Admin challenge tag (spec 0001-admin-device-self-approval). The server sends a one time X25519
 * public key; the phone agrees with the recovery secret key and derives a 32 byte tag bound to its
 * own device id. Nothing is decrypted on either side, so the flow can never be turned into an
 * oracle for the sealed boxes that share the recovery key.
 *
 * `tag = hkdf_sha256(ikm = x25519(sk, pk), salt = eph_pub || recovery_pub || device_id, info, 32)`
 */
export const CHALLENGE_INFO = 'f2h:admin-challenge:v1';
export const TAG_LEN = 32;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The 16 raw bytes of a uuid string. */
export function uuidToBytes(uuid: string): Uint8Array {
  if (!UUID_RE.test(uuid)) throw new CryptoError('bad_length', 'not a uuid');
  return fromHex(uuid.replace(/-/g, '').toLowerCase());
}

function deriveTag(
  shared: Uint8Array,
  ephPub: Uint8Array,
  recoveryPub: Uint8Array,
  deviceId: string,
): Uint8Array {
  try {
    return hkdf(
      shared,
      concat(ephPub, recoveryPub, uuidToBytes(deviceId)),
      CHALLENGE_INFO,
      TAG_LEN,
    );
  } finally {
    zero(shared);
  }
}

/** Phone side: the answer to a challenge, from the recovery secret key. */
export function answerTag(
  recoverySecret: Uint8Array,
  ephPub: Uint8Array,
  recoveryPub: Uint8Array,
  deviceId: string,
): Uint8Array {
  assertLength(recoverySecret, SECRET_KEY_LEN, 'recovery secret key');
  assertLength(ephPub, PUBLIC_KEY_LEN, 'ephemeral public key');
  assertLength(recoveryPub, PUBLIC_KEY_LEN, 'recovery public key');
  return deriveTag(x25519.getSharedSecret(recoverySecret, ephPub), ephPub, recoveryPub, deviceId);
}

/** Server side mirror, kept here so one vector file pins both ends. */
export function issueTag(
  ephSecret: Uint8Array,
  recoveryPub: Uint8Array,
  deviceId: string,
): { ephPub: Uint8Array; tag: Uint8Array } {
  assertLength(ephSecret, SECRET_KEY_LEN, 'ephemeral secret key');
  assertLength(recoveryPub, PUBLIC_KEY_LEN, 'recovery public key');
  const ephPub = x25519.getPublicKey(ephSecret);
  return {
    ephPub,
    tag: deriveTag(x25519.getSharedSecret(ephSecret, recoveryPub), ephPub, recoveryPub, deviceId),
  };
}
