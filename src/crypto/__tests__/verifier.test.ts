import { sealWithNonce } from '../aead';
import { generateMasterKey } from '../envelope';
import { check, make } from '../verifier';
import { bytes, flipBit, hex, utf8, vectors } from './helpers';

const v = vectors.verifier;
const mk = bytes(v.mk);

describe('mk verifier (AC-7)', () => {
  it('reproduces the vector and verifies it', () => {
    expect(hex(sealWithNonce(mk, bytes(v.nonce), utf8('f2h:mk-check'), v.userId))).toBe(v.wire);
    expect(check(mk, v.userId, bytes(v.wire))).toBe(true);
  });

  it('round trips and fails for a different MK, user or a tampered wire', () => {
    const wire = make(mk, v.userId);
    expect(check(mk, v.userId, wire)).toBe(true);
    expect(check(generateMasterKey(), v.userId, wire)).toBe(false);
    expect(check(mk, 'someone-else', wire)).toBe(false);
    expect(check(mk, v.userId, flipBit(wire, 10))).toBe(false);
    expect(check(mk, v.userId, wire.subarray(0, 8))).toBe(false);
  });
});
