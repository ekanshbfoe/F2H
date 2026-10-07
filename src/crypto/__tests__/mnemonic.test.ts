import { CryptoError } from '../errors';
import { fromSeed, isValid, toSeed } from '../mnemonic';
import { generateSeed } from '../recovery';
import { bytes, pick, vectors } from './helpers';

describe('recovery mnemonic (AC-10)', () => {
  it('maps a 32 byte seed to 24 English words and back (vectors)', () => {
    for (const v of vectors.mnemonic) {
      const words = fromSeed(bytes(v.seed));
      expect(words).toHaveLength(24);
      expect(words.join(' ')).toBe(v.words);
      expect(toSeed(words)).toEqual(bytes(v.seed));
      expect(toSeed(v.words)).toEqual(bytes(v.seed));
    }
  });

  it('round trips a random seed and normalizes case and spacing', () => {
    const seed = generateSeed();
    const words = fromSeed(seed);
    expect(toSeed(words.map((w) => w.toUpperCase()).join('   '))).toEqual(seed);
    expect(isValid(words)).toBe(true);
  });

  it('rejects a bad checksum, a bad word and a wrong length', () => {
    const v = pick(vectors.mnemonic, 0);
    const words = v.words.split(' ');
    const badChecksum = [...words.slice(0, 23), 'abandon'];
    expect(isValid(badChecksum)).toBe(false);
    expect(() => toSeed(badChecksum)).toThrow(CryptoError);
    expect(() => toSeed([...words.slice(0, 23), 'notaword'])).toThrow(/invalid recovery phrase/);
    expect(() => toSeed(words.slice(0, 12))).toThrow(CryptoError);
    expect(() => fromSeed(new Uint8Array(16))).toThrow(CryptoError);
  });
});
