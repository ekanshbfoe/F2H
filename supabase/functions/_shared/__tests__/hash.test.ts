// covers: AC-8 (device token hashing matches the SQL side: sha256 hex of the decoded base64 token)
import { base64ToBytes, bytesToBase64, sha256Hex } from '../hash.ts';

describe('sha256Hex', () => {
  it('matches the published SHA 256 vector for "abc"', async () => {
    await expect(sha256Hex(new TextEncoder().encode('abc'))).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes the empty input to the known empty digest', async () => {
    await expect(sha256Hex(new Uint8Array(0))).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

describe('base64 helpers', () => {
  it('round trips 32 token bytes', () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => (i * 7) & 255);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('decodes the padded form the app sends for a 32 byte token', () => {
    expect(base64ToBytes('AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=')).toEqual(
      new Uint8Array(32).fill(1),
    );
  });

  it('throws on a header that is not base64', () => {
    expect(() => base64ToBytes('not base64!!')).toThrow();
  });
});
