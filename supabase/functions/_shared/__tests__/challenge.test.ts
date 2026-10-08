// covers: AC-2, AC-9 (the server tag equals the client tag for the shared vector)
import vectors from '../../../../src/crypto/__tests__/vectors.json';
import {
  byteaToBytes,
  bytesToHex,
  computeTag,
  hexToBytes,
  issueChallenge,
  tagHashOf,
  uuidToBytes,
} from '../challenge.ts';

const v = vectors.adminChallenge;

describe('admin challenge (server side)', () => {
  it('issues the vector challenge: same eph_pub, same tag hash, secret consumed', () => {
    const ephSecret = hexToBytes(v.ephSecretKey);
    const issued = issueChallenge(hexToBytes(v.recoveryPub), v.deviceId, ephSecret);
    expect(bytesToHex(issued.ephPub)).toBe(v.ephPub);
    expect(issued.tagHash).toBe(v.tagHash);
    expect(Array.from(ephSecret).every((b) => b === 0)).toBe(true);
  });

  it('hashes the phone tag to the stored value', () => {
    expect(tagHashOf(hexToBytes(v.tag))).toBe(v.tagHash);
  });

  it('computes the same tag from the shared secret on either side', () => {
    const { x25519 } = jest.requireActual('@noble/curves/ed25519.js');
    const shared = x25519.getSharedSecret(hexToBytes(v.recoverySecretKey), hexToBytes(v.ephPub));
    const tag = computeTag(shared, hexToBytes(v.ephPub), hexToBytes(v.recoveryPub), v.deviceId);
    expect(bytesToHex(tag)).toBe(v.tag);
  });

  it('issues a fresh ephemeral key every time', () => {
    const a = issueChallenge(hexToBytes(v.recoveryPub), v.deviceId);
    const b = issueChallenge(hexToBytes(v.recoveryPub), v.deviceId);
    expect(bytesToHex(a.ephPub)).not.toBe(bytesToHex(b.ephPub));
    expect(a.tagHash).not.toBe(b.tagHash);
  });

  it('decodes PostgREST bytea and uuids, and refuses junk', () => {
    expect(bytesToHex(byteaToBytes(`\\x${v.recoveryPub}`))).toBe(v.recoveryPub);
    expect(bytesToHex(uuidToBytes(v.deviceId))).toBe('a2a2a2a2a2a24a2a8a2aa2a2a2a2a2a2');
    expect(() => uuidToBytes('nope')).toThrow('not a uuid');
    expect(() => issueChallenge(new Uint8Array(31), v.deviceId)).toThrow('32 bytes');
  });
});
