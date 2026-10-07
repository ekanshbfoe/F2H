import { generateKeypair, open, publicKeyOf, seal, sealWith } from '../box';
import { CryptoError } from '../errors';
import { deriveRecoveryKeypair, fingerprint } from '../recovery';
import { bytes, flipBit, hex, vectors } from './helpers';

const v = vectors.box;

describe('sealed box (AC-4)', () => {
  it('reproduces the vector and opens it', () => {
    const wire = sealWith(
      bytes(v.recipientPub),
      bytes(v.plaintext),
      bytes(v.ephSecret),
      bytes(v.nonce),
    );
    expect(hex(wire)).toBe(v.wire);
    expect(hex(publicKeyOf(bytes(v.recipientSecret)))).toBe(v.recipientPub);
    expect(hex(open(bytes(v.recipientSecret), bytes(v.wire)))).toBe(v.plaintext);
  });

  it('round trips with a random ephemeral key and rejects tampering or the wrong recipient', () => {
    const recipient = generateKeypair();
    const other = generateKeypair();
    const wire = seal(recipient.publicKey, bytes(v.plaintext));
    expect(wire).toHaveLength(1 + 32 + 24 + 32 + 16);
    expect(open(recipient.secretKey, wire)).toEqual(bytes(v.plaintext));
    expect(() => open(other.secretKey, wire)).toThrow(CryptoError);
    expect(() => open(recipient.secretKey, flipBit(wire, 5))).toThrow(CryptoError);
    expect(() => open(recipient.secretKey, flipBit(wire, wire.length - 1))).toThrow(CryptoError);
    const badVersion = wire.slice();
    badVersion[0] = 0x09;
    expect(() => open(recipient.secretKey, badVersion)).toThrow(/version/);
  });
});

describe('recovery keypair and fingerprint', () => {
  it('derives the keypair from the seed and formats the fingerprint', () => {
    const r = vectors.recovery;
    const pair = deriveRecoveryKeypair(bytes(r.seed));
    expect(hex(pair.secretKey)).toBe(r.secretKey);
    expect(hex(pair.publicKey)).toBe(r.publicKey);
    expect(fingerprint(pair.publicKey)).toBe(r.fingerprint);
    expect(fingerprint(pair.publicKey)).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){3}$/);
    expect(hex(open(pair.secretKey, seal(pair.publicKey, bytes(v.plaintext))))).toBe(v.plaintext);
  });
});
