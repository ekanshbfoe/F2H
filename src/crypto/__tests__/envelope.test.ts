import { sealWithNonce } from '../aead';
import {
  decryptItem,
  encryptItem,
  generateDek,
  generateMasterKey,
  unwrapDek,
  unwrapMk,
  wrapDek,
  wrapMk,
} from '../envelope';
import { CryptoError } from '../errors';
import {
  deriveBioWrapKey,
  deriveLocalWrapKey,
  unwrapMkBio,
  unwrapMkLocal,
  wrapMkBio,
  wrapMkLocal,
} from '../local-wrap';
import { bytes, hex, utf8, vectors } from './helpers';

const v = vectors.envelope;
const mk = bytes(v.mk);
const dek = bytes(v.dek);

describe('envelope (AC-5)', () => {
  it('wraps the DEK under the MK with the item id as AAD (vector)', () => {
    expect(hex(sealWithNonce(mk, bytes(v.nonce), dek, v.itemId))).toBe(v.wrapped);
    expect(unwrapDek(mk, bytes(v.wrapped), v.itemId)).toEqual(dek);
  });

  it('round trips and fails on a different item id or MK', () => {
    const wrapped = wrapDek(mk, dek, v.itemId);
    expect(unwrapDek(mk, wrapped, v.itemId)).toEqual(dek);
    expect(() => unwrapDek(mk, wrapped, 'another-item')).toThrow(CryptoError);
    expect(() => unwrapDek(generateMasterKey(), wrapped, v.itemId)).toThrow(CryptoError);
  });

  it('encrypts item JSON under a fresh DEK and wraps the MK under the KEK', () => {
    const freshDek = generateDek();
    const json = JSON.stringify({ kind: 'credential', site: 'bank' });
    const ct = encryptItem(freshDek, json, v.itemId);
    expect(new TextDecoder().decode(decryptItem(freshDek, ct, v.itemId))).toBe(json);
    const kek = bytes(vectors.passwordSplit.kek);
    const wrapped = wrapMk(kek, mk, vectors.verifier.userId);
    expect(unwrapMk(kek, wrapped, vectors.verifier.userId)).toEqual(mk);
    expect(() => unwrapMk(kek, wrapped, 'other-user')).toThrow(CryptoError);
  });
});

describe('local and biometric wrap', () => {
  const lw = vectors.localWrap;

  it('derives the PIN wrap key from PIN, device salt and device secret (vector)', async () => {
    const wrapKey = await deriveLocalWrapKey(lw.pin, bytes(lw.deviceSalt), bytes(lw.deviceSecret));
    expect(hex(wrapKey)).toBe(lw.wrapKey);
    const owner = vectors.verifier.userId;
    const wrapped = wrapMkLocal(wrapKey, mk, owner);
    expect(unwrapMkLocal(wrapKey, wrapped, owner)).toEqual(mk);
    expect(() => unwrapMkLocal(wrapKey, wrapped, 'other-user')).toThrow(CryptoError);
    const wrongPin = await deriveLocalWrapKey(
      '000000',
      bytes(lw.deviceSalt),
      bytes(lw.deviceSecret),
    );
    expect(() => unwrapMkLocal(wrongPin, wrapped, owner)).toThrow(CryptoError);
  });

  it('derives the biometric wrap key from the device secret alone (vector)', () => {
    const bioKey = deriveBioWrapKey(bytes(lw.deviceSecret));
    expect(hex(bioKey)).toBe(lw.bioKey);
    expect(unwrapMkBio(bioKey, wrapMkBio(bioKey, mk))).toEqual(mk);
    expect(() => deriveBioWrapKey(utf8('short'))).toThrow(CryptoError);
  });
});
