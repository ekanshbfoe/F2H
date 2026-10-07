import { hkdf, SCRYPT_DEFAULT, scrypt, scryptAsync } from '../kdf';
import { bytes, hex, pick, vectors } from './helpers';

describe('kdf (AC-2)', () => {
  it('scrypt reproduces RFC 7914 and the F2H default vector', async () => {
    for (const v of vectors.scrypt) {
      const params = { N: v.N, r: v.r, p: v.p, dkLen: v.dkLen };
      expect(hex(scrypt(v.password, v.salt, params))).toBe(v.dk);
      expect(hex(await scryptAsync(v.password, v.salt, params))).toBe(v.dk);
    }
  });

  it('defaults are the spec values', () => {
    expect(SCRYPT_DEFAULT).toEqual({ N: 1024, r: 8, p: 1, dkLen: 32 });
  });

  it('hkdf reproduces RFC 5869 case 1 and a string salt and info', () => {
    const rfc = pick(vectors.hkdf, 0);
    const f2h = pick(vectors.hkdf, 1);
    expect(
      hex(hkdf(bytes(rfc.ikm), bytes(rfc.salt ?? ''), bytes(rfc.info ?? ''), rfc.length)),
    ).toBe(rfc.okm);
    expect(hex(hkdf(bytes(f2h.ikm), f2h.saltText ?? '', f2h.infoText ?? '', f2h.length))).toBe(
      f2h.okm,
    );
  });
});
