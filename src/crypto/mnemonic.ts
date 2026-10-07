import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

import { CryptoError } from './errors';
import { SEED_LEN } from './recovery';

export const WORD_COUNT = 24;

/** 32 byte recovery seed → 24 BIP39 English words for the paper kit. */
export function fromSeed(seed: Uint8Array): string[] {
  if (seed.length !== SEED_LEN) throw new CryptoError('bad_length', 'seed must be 32 bytes');
  return entropyToMnemonic(seed, wordlist).split(' ');
}

/** Accepts the 24 words as an array or one string; whitespace and case are normalized. */
export function normalize(words: string[] | string): string {
  const list = Array.isArray(words) ? words : words.split(/\s+/);
  return list
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0)
    .join(' ');
}

export function isValid(words: string[] | string): boolean {
  const phrase = normalize(words);
  return phrase.split(' ').length === WORD_COUNT && validateMnemonic(phrase, wordlist);
}

/** Inverse of `fromSeed`; throws `CryptoError('bad_mnemonic')` on a wrong word or checksum. */
export function toSeed(words: string[] | string): Uint8Array {
  const phrase = normalize(words);
  if (!isValid(phrase)) throw new CryptoError('bad_mnemonic', 'invalid recovery phrase');
  return mnemonicToEntropy(phrase, wordlist);
}
