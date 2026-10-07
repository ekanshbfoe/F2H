/**
 * The only public surface of `src/crypto/`. Everything outside this folder imports from here.
 * Key bytes never leave this module except as the values callers must hold in memory
 * (the Master Key while unlocked, a DEK while an item is open).
 */
import './polyfill';

import { open as aeadOpen, seal as aeadSeal, KEY_LEN, NONCE_LEN, TAG_LEN } from './aead';
import { generateKeypair, open as boxOpen, publicKeyOf, seal as boxSeal } from './box';
import { decryptFile, encryptFile, parseHeader } from './chunked';
import * as envelope from './envelope';
import * as localWrap from './local-wrap';
import * as mnemonic from './mnemonic';
import * as recovery from './recovery';
import * as verifier from './verifier';

export { randomSourceReady } from './polyfill';
export { randomBytes, randomUuid, randomBlobId } from './random';
export {
  toBase64,
  fromBase64,
  toBase64Url,
  fromBase64Url,
  toHex,
  fromHex,
  utf8ToBytes,
  bytesToUtf8,
  concat,
  equalBytes,
  zero,
} from './encoding';
export { CryptoError, type CryptoErrorCode } from './errors';
export { sha256, createSha256 } from './hash';
export { SCRYPT_DEFAULT, scrypt, scryptAsync, hkdf, type ScryptParams } from './kdf';
export {
  passwordSplit,
  passwordSplitSync,
  normalizeEmail,
  type PasswordSplit,
} from './password-split';
export { benchScrypt, type KdfBenchResult } from './bench';
export {
  type FileAdapter,
  type ChunkedHeader,
  type EncryptFileOptions,
  type EncryptFileResult,
  type DecryptFileOptions,
  DEFAULT_CHUNK_SIZE,
} from './chunked';
export { createMemoryFs, type MemoryFs } from './adapters/memory';
export type { Keypair } from './box';

/** XChaCha20 Poly1305 with the `0x01 || nonce || ct` wire format. Random nonces only. */
export const aead = { seal: aeadSeal, open: aeadOpen, KEY_LEN, NONCE_LEN, TAG_LEN } as const;

/** X25519 sealed box for the Admin recovery path. */
export const box = { seal: boxSeal, open: boxOpen, generateKeypair, publicKeyOf } as const;

/** Chunked file format for Drive blobs; storage is injected through a `FileAdapter`. */
export const chunked = { encryptFile, decryptFile, parseHeader } as const;

export { envelope, localWrap, mnemonic, recovery, verifier };
