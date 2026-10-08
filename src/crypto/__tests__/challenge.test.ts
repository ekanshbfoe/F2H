// covers: AC-2, AC-9 (admin challenge tag: both ends reproduce one vector, no decrypt path)
import { seal } from '../box';
import { answerTag, issueTag, TAG_LEN, uuidToBytes } from '../challenge';
import { CryptoError } from '../errors';
import { deriveRecoveryKeypair } from '../recovery';
import { bytes, hex, vectors } from './helpers';

const v = vectors.adminChallenge;

describe('admin challenge tag (spec 0001-admin-device-self-approval, AC-2)', () => {
  it('reproduces the vector on both ends', () => {
    const issued = issueTag(bytes(v.ephSecretKey), bytes(v.recoveryPub), v.deviceId);
    expect(hex(issued.ephPub)).toBe(v.ephPub);
    expect(hex(issued.tag)).toBe(v.tag);
    const answered = answerTag(
      bytes(v.recoverySecretKey),
      bytes(v.ephPub),
      bytes(v.recoveryPub),
      v.deviceId,
    );
    expect(hex(answered)).toBe(v.tag);
    expect(answered).toHaveLength(TAG_LEN);
  });

  it('derives the recovery key from the kit seed the same way the kit does', () => {
    const pair = deriveRecoveryKeypair(bytes(vectors.recovery.seed));
    expect(hex(pair.publicKey)).toBe(v.recoveryPub);
    expect(hex(answerTag(pair.secretKey, bytes(v.ephPub), pair.publicKey, v.deviceId))).toBe(v.tag);
  });

  it('binds the tag to the device id and to the ephemeral key', () => {
    const other = answerTag(
      bytes(v.recoverySecretKey),
      bytes(v.ephPub),
      bytes(v.recoveryPub),
      'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2',
    );
    expect(hex(other)).not.toBe(v.tag);
    const otherEph = issueTag(
      bytes(v.ephSecretKey.replace(/^0102/, '0103')),
      bytes(v.recoveryPub),
      v.deviceId,
    );
    expect(hex(otherEph.tag)).not.toBe(v.tag);
  });

  it('is not a decryption oracle: a sealed box offered as the challenge yields only an HKDF output', () => {
    const pair = deriveRecoveryKeypair(bytes(vectors.recovery.seed));
    const mk = bytes('aa'.repeat(32));
    const wire = seal(pair.publicKey, mk);
    // wire = 0x01 || eph_pub(32) || nonce || ct; a hostile server could only hand over eph_pub.
    const ephPubFromBox = wire.subarray(1, 33);
    const out = answerTag(pair.secretKey, ephPubFromBox, pair.publicKey, v.deviceId);
    expect(out).toHaveLength(TAG_LEN);
    expect(hex(out)).not.toBe(hex(mk));
    expect(() => answerTag(pair.secretKey, wire, pair.publicKey, v.deviceId)).toThrow(CryptoError);
  });

  it('rejects wrong lengths and a malformed device id', () => {
    expect(() => answerTag(bytes('00'), bytes(v.ephPub), bytes(v.recoveryPub), v.deviceId)).toThrow(
      CryptoError,
    );
    expect(() => uuidToBytes('not-a-uuid')).toThrow(CryptoError);
    expect(hex(uuidToBytes(v.deviceId))).toBe('a2a2a2a2a2a24a2a8a2aa2a2a2a2a2a2');
  });
});
