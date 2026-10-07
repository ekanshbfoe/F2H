import { AEAD_VERSION, NONCE_LEN, open, seal, sealWithNonce } from '../aead';
import { CryptoError } from '../errors';
import { bytes, flipBit, hex, vectors } from './helpers';

const v = vectors.aead.wire;
const key = bytes(v.key);
const plaintext = bytes(v.plaintext);

describe('aead (AC-3)', () => {
  it('matches the raw XChaCha20 Poly1305 draft vector through the wire format', () => {
    const raw = vectors.aead.raw;
    const wire = sealWithNonce(
      bytes(raw.key),
      bytes(raw.nonce),
      bytes(raw.plaintext),
      bytes(raw.aad),
    );
    expect(hex(wire.subarray(1 + NONCE_LEN))).toBe(raw.ciphertext);
  });

  it('seals as 0x01 || nonce(24) || ct and reproduces the vector', () => {
    const wire = sealWithNonce(key, bytes(v.nonce), plaintext, v.aad);
    expect(hex(wire)).toBe(v.wire);
    expect(wire[0]).toBe(AEAD_VERSION);
    expect(hex(wire.subarray(1, 1 + NONCE_LEN))).toBe(v.nonce);
    expect(open(key, bytes(v.wire), v.aad)).toEqual(plaintext);
  });

  it('uses a fresh random nonce per call', () => {
    const a = seal(key, plaintext, v.aad);
    const b = seal(key, plaintext, v.aad);
    expect(a).not.toEqual(b);
    expect(open(key, a, v.aad)).toEqual(plaintext);
    expect(open(key, b, v.aad)).toEqual(plaintext);
  });

  it('rejects a flipped bit, a wrong AAD, an unknown version and a short input', () => {
    const wire = bytes(v.wire);
    const code = (fn: () => unknown) => {
      try {
        fn();
        return 'none';
      } catch (e) {
        return e instanceof CryptoError ? e.code : 'other';
      }
    };
    expect(code(() => open(key, flipBit(wire, wire.length - 1), v.aad))).toBe('auth_failed');
    expect(code(() => open(key, flipBit(wire, 30), v.aad))).toBe('auth_failed');
    expect(code(() => open(key, wire, 'item-0002'))).toBe('auth_failed');
    const badVersion = wire.slice();
    badVersion[0] = 0x02;
    expect(code(() => open(key, badVersion, v.aad))).toBe('bad_version');
    expect(code(() => open(key, wire.subarray(0, 20), v.aad))).toBe('bad_length');
    expect(code(() => open(key.subarray(0, 16), wire, v.aad))).toBe('bad_length');
  });
});
