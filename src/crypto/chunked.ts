import * as aead from './aead';
import { concat, equalBytes, readU32be, toHex, u32be, utf8ToBytes } from './encoding';
import { assertLength, CryptoError } from './errors';
import { createSha256 } from './hash';
import { randomBytes } from './random';

/**
 * Storage access for the chunked format. The real adapter (expo-file-system) is injected by the
 * files feature; tests use `createMemoryFs()`. This module never touches a file system itself.
 */
export interface FileAdapter {
  size(uri: string): Promise<number>;
  /** Reads up to `length` bytes starting at `position`; shorter only at the end of the file. */
  read(uri: string, position: number, length: number): Promise<Uint8Array>;
  /** Creates `uri` as an empty file, replacing any existing content. */
  create(uri: string): Promise<void>;
  append(uri: string, bytes: Uint8Array): Promise<void>;
}

export const MAGIC = utf8ToBytes('F2H1');
export const HEADER_LEN = 64;
export const BLOB_ID_LEN = 16;
export const DEFAULT_CHUNK_SIZE = 1024 * 1024;
export const MAX_CHUNK_SIZE = 16 * 1024 * 1024;
const CHUNK_OVERHEAD = aead.NONCE_LEN + aead.TAG_LEN;
const CHUNK_AAD_PREFIX = utf8ToBytes('f2h:chunk:v1');

export interface ChunkedHeader {
  blobId: Uint8Array;
  version: number;
  chunkSize: number;
  totalChunks: number;
}

export interface EncryptFileOptions {
  fs: FileAdapter;
  outputUri: string;
  /** Plaintext bytes per chunk, default 1 MiB. */
  chunkSize?: number;
  /** Upload version, generated per upload by the files feature. Default 1. */
  version?: number;
  /** Test only: deterministic nonces for vectors. Production always uses random nonces. */
  nonceFor?: (index: number) => Uint8Array;
}

export interface EncryptFileResult {
  outputUri: string;
  /** Plaintext size in bytes. */
  size: number;
  sizeCt: number;
  /** Hex sha256 of the whole ciphertext file, the value both Drives are verified against. */
  sha256Ct: string;
  chunkSize: number;
  totalChunks: number;
  version: number;
}

export interface DecryptFileOptions {
  fs: FileAdapter;
  outputUri: string;
}

/** `"F2H1" || blob_id(16) || version(4) || chunk_size(4) || total_chunks(4) || zeros(32)`. */
export function buildHeader(h: ChunkedHeader): Uint8Array {
  assertLength(h.blobId, BLOB_ID_LEN, 'blob id');
  const header = concat(
    MAGIC,
    h.blobId,
    u32be(h.version),
    u32be(h.chunkSize),
    u32be(h.totalChunks),
  );
  const out = new Uint8Array(HEADER_LEN);
  out.set(header, 0);
  return out;
}

export function parseHeader(bytes: Uint8Array): ChunkedHeader {
  if (bytes.length < HEADER_LEN) throw new CryptoError('bad_format', 'file shorter than header');
  if (!equalBytes(bytes.subarray(0, 4), MAGIC)) throw new CryptoError('bad_format', 'bad magic');
  const header: ChunkedHeader = {
    blobId: bytes.slice(4, 4 + BLOB_ID_LEN),
    version: readU32be(bytes, 20),
    chunkSize: readU32be(bytes, 24),
    totalChunks: readU32be(bytes, 28),
  };
  if (header.chunkSize === 0 || header.chunkSize > MAX_CHUNK_SIZE) {
    throw new CryptoError('bad_format', 'chunk size out of range');
  }
  if (header.totalChunks === 0) throw new CryptoError('bad_format', 'zero chunks');
  return header;
}

/**
 * Chunk AAD: `"f2h:chunk:v1" || blob_id || version || index || total_chunks || is_final`;
 * chunk 0 also binds the full 64 byte header so an edited total or chunk size is rejected.
 */
export function chunkAad(header: Uint8Array, h: ChunkedHeader, index: number): Uint8Array {
  const isFinal = index === h.totalChunks - 1 ? 1 : 0;
  const base = concat(
    CHUNK_AAD_PREFIX,
    h.blobId,
    u32be(h.version),
    u32be(index),
    u32be(h.totalChunks),
    new Uint8Array([isFinal]),
  );
  return index === 0 ? concat(base, header) : base;
}

function chunkCount(size: number, chunkSize: number): number {
  return Math.max(1, Math.ceil(size / chunkSize));
}

/**
 * Encrypts `inputUri` into `outputUri` as `header(64) || (nonce || ct)*`, one plaintext chunk
 * in memory at a time. A new blob id and a new DEK are required for every upload.
 */
export async function encryptFile(
  inputUri: string,
  dek: Uint8Array,
  blobId: Uint8Array,
  opts: EncryptFileOptions,
): Promise<EncryptFileResult> {
  assertLength(dek, aead.KEY_LEN, 'dek');
  assertLength(blobId, BLOB_ID_LEN, 'blob id');
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  if (chunkSize <= 0 || chunkSize > MAX_CHUNK_SIZE) throw new RangeError('chunkSize out of range');
  const version = opts.version ?? 1;
  const { fs, outputUri } = opts;

  const size = await fs.size(inputUri);
  const totalChunks = chunkCount(size, chunkSize);
  const meta: ChunkedHeader = { blobId, version, chunkSize, totalChunks };
  const header = buildHeader(meta);
  const hash = createSha256();

  await fs.create(outputUri);
  await fs.append(outputUri, header);
  hash.update(header);
  let sizeCt = header.length;

  for (let i = 0; i < totalChunks; i += 1) {
    const plain = await fs.read(inputUri, i * chunkSize, chunkSize);
    const nonce = opts.nonceFor ? opts.nonceFor(i) : randomBytes(aead.NONCE_LEN);
    const wire = aead.sealWithNonce(dek, nonce, plain, chunkAad(header, meta, i));
    const chunk = wire.subarray(1); // strip the version byte; the header carries the format version
    await fs.append(outputUri, chunk);
    hash.update(chunk);
    sizeCt += chunk.length;
    plain.fill(0);
  }

  return {
    outputUri,
    size,
    sizeCt,
    sha256Ct: toHex(hash.digest()),
    chunkSize,
    totalChunks,
    version,
  };
}

/**
 * Restores the plaintext file. Rejects a wrong blob id, a truncated or padded file, a reordered
 * chunk, a chunk from another blob and a header edited to a different total.
 */
export async function decryptFile(
  inputUri: string,
  dek: Uint8Array,
  blobId: Uint8Array,
  opts: DecryptFileOptions,
): Promise<{ outputUri: string; size: number }> {
  assertLength(dek, aead.KEY_LEN, 'dek');
  assertLength(blobId, BLOB_ID_LEN, 'blob id');
  const { fs, outputUri } = opts;

  const fileSize = await fs.size(inputUri);
  const header = await fs.read(inputUri, 0, HEADER_LEN);
  const meta = parseHeader(header);
  if (!equalBytes(meta.blobId, blobId)) throw new CryptoError('bad_format', 'blob id mismatch');

  const fullChunk = meta.chunkSize + CHUNK_OVERHEAD;
  const bodyLen = fileSize - HEADER_LEN;
  const minBody = (meta.totalChunks - 1) * fullChunk + CHUNK_OVERHEAD;
  const maxBody = meta.totalChunks * fullChunk;
  if (bodyLen < minBody || bodyLen > maxBody) {
    throw new CryptoError('bad_length', 'ciphertext length does not match header');
  }

  await fs.create(outputUri);
  let size = 0;
  let position = HEADER_LEN;
  for (let i = 0; i < meta.totalChunks; i += 1) {
    const isLast = i === meta.totalChunks - 1;
    const length = isLast ? fileSize - position : fullChunk;
    const chunk = await fs.read(inputUri, position, length);
    if (chunk.length !== length) throw new CryptoError('bad_length', 'short read');
    const wire = concat(new Uint8Array([aead.AEAD_VERSION]), chunk);
    const plain = aead.open(dek, wire, chunkAad(header, meta, i));
    await fs.append(outputUri, plain);
    size += plain.length;
    plain.fill(0);
    position += length;
  }
  return { outputUri, size };
}
