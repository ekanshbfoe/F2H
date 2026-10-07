import { createMemoryFs } from '../adapters/memory';
import { buildHeader, decryptFile, encryptFile, HEADER_LEN, parseHeader } from '../chunked';
import { CryptoError } from '../errors';
import { bytes, hex, seq, vectors } from './helpers';

const v = vectors.chunked;
const dek = bytes(v.dek);
const blobId = bytes(v.blobId);

async function encryptVector() {
  const fs = createMemoryFs({ in: bytes(v.plaintext) });
  const result = await encryptFile('in', dek, blobId, {
    fs,
    outputUri: 'out',
    chunkSize: v.chunkSize,
    version: v.version,
    nonceFor: (i) => bytes(v.nonces[i] ?? ''),
  });
  return { fs, result };
}

async function expectRejected(file: Uint8Array, code?: string) {
  const fs = createMemoryFs({ ct: file });
  const promise = decryptFile('ct', dek, blobId, { fs, outputUri: 'plain' });
  await expect(promise).rejects.toBeInstanceOf(CryptoError);
  if (code) await expect(promise).rejects.toMatchObject({ code });
}

describe('chunked file format (AC-8)', () => {
  it('writes header(64) || (nonce || ct)* and reproduces the vector byte for byte', async () => {
    const { fs, result } = await encryptVector();
    expect(hex(fs.get('out'))).toBe(v.file);
    expect(result).toMatchObject({
      size: 37,
      sizeCt: fs.get('out').length,
      sha256Ct: v.sha256Ct,
      chunkSize: v.chunkSize,
      totalChunks: v.totalChunks,
      version: v.version,
    });
    expect(parseHeader(fs.get('out'))).toEqual({
      blobId,
      version: v.version,
      chunkSize: v.chunkSize,
      totalChunks: v.totalChunks,
    });
    expect(buildHeader(parseHeader(fs.get('out')))).toEqual(fs.get('out').subarray(0, HEADER_LEN));
  });

  it('decrypts back to a byte identical file', async () => {
    const { fs } = await encryptVector();
    const { size } = await decryptFile('out', dek, blobId, { fs, outputUri: 'plain' });
    expect(size).toBe(37);
    expect(fs.get('plain')).toEqual(bytes(v.plaintext));
  });

  it('never reads more than one chunk of plaintext at a time', async () => {
    const fs = createMemoryFs({ in: seq(100) });
    const reads: number[] = [];
    const spyFs = {
      ...fs,
      read: (uri: string, position: number, length: number) => {
        if (uri === 'in') reads.push(length);
        return fs.read(uri, position, length);
      },
    };
    const result = await encryptFile('in', dek, blobId, {
      fs: spyFs,
      outputUri: 'out',
      chunkSize: 32,
    });
    expect(reads).toEqual([32, 32, 32, 32]);
    expect(result.totalChunks).toBe(4);
    await decryptFile('out', dek, blobId, { fs, outputUri: 'plain' });
    expect(fs.get('plain')).toEqual(seq(100));
  });

  it('handles an empty file and an exact multiple of the chunk size', async () => {
    for (const plain of [new Uint8Array(0), seq(64)]) {
      const fs = createMemoryFs({ in: plain });
      const r = await encryptFile('in', dek, blobId, { fs, outputUri: 'out', chunkSize: 32 });
      expect(r.totalChunks).toBe(Math.max(1, plain.length / 32));
      await decryptFile('out', dek, blobId, { fs, outputUri: 'plain' });
      expect(fs.get('plain')).toEqual(plain);
    }
  });

  it('uses random nonces by default', async () => {
    const fs = createMemoryFs({ in: seq(10) });
    await encryptFile('in', dek, blobId, { fs, outputUri: 'a' });
    await encryptFile('in', dek, blobId, { fs, outputUri: 'b' });
    expect(fs.get('a')).not.toEqual(fs.get('b'));
  });
});

describe('chunked file rejections (AC-9)', () => {
  it('rejects a truncated file', async () => {
    const { fs } = await encryptVector();
    const file = fs.get('out');
    await expectRejected(file.subarray(0, file.length - 1));
    await expectRejected(file.subarray(0, file.length - 60), 'bad_length');
    await expectRejected(file.subarray(0, 40), 'bad_format');
  });

  it('rejects a reordered chunk', async () => {
    const { fs } = await encryptVector();
    const file = fs.get('out');
    const chunkLen = v.chunkSize + 24 + 16;
    const swapped = file.slice();
    swapped.set(file.subarray(HEADER_LEN + chunkLen, HEADER_LEN + 2 * chunkLen), HEADER_LEN);
    swapped.set(file.subarray(HEADER_LEN, HEADER_LEN + chunkLen), HEADER_LEN + chunkLen);
    await expectRejected(swapped, 'auth_failed');
  });

  it('rejects a chunk from another blob', async () => {
    const { fs } = await encryptVector();
    const otherFs = createMemoryFs({ in: bytes(v.plaintext) });
    await encryptFile('in', dek, seq(16, 0xee), {
      fs: otherFs,
      outputUri: 'out',
      chunkSize: v.chunkSize,
      version: v.version,
    });
    const file = fs.get('out');
    const chunkLen = v.chunkSize + 24 + 16;
    const mixed = file.slice();
    mixed.set(
      otherFs.get('out').subarray(HEADER_LEN + chunkLen, HEADER_LEN + 2 * chunkLen),
      HEADER_LEN + chunkLen,
    );
    await expectRejected(mixed, 'auth_failed');
    await expect(
      decryptFile('out', dek, seq(16, 0xee), { fs, outputUri: 'plain' }),
    ).rejects.toMatchObject({ code: 'bad_format' });
  });

  it('rejects a header edited to a different total or chunk size', async () => {
    const { fs } = await encryptVector();
    const file = fs.get('out');
    const chunkLen = v.chunkSize + 24 + 16;
    const fewer = file.slice(0, HEADER_LEN + 2 * chunkLen);
    fewer[31] = 2; // total_chunks 3 → 2, body length now consistent with the lie
    await expectRejected(fewer, 'auth_failed');
    const bigger = file.slice();
    bigger[27] = 17; // chunk_size 16 → 17
    await expectRejected(bigger);
  });

  it('rejects a wrong DEK and a bad magic', async () => {
    const { fs } = await encryptVector();
    await expect(
      decryptFile('out', seq(32, 0x01), blobId, { fs, outputUri: 'plain' }),
    ).rejects.toMatchObject({ code: 'auth_failed' });
    const bad = fs.get('out').slice();
    bad[0] = 0x58;
    await expectRejected(bad, 'bad_format');
  });
});
