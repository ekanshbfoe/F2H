import * as aead from './aead';
import { asBytes } from './encoding';
import { randomBytes } from './random';

/** Master Key (per member) and Data Encryption Key (per vault item) are both 32 random bytes. */
export const generateMasterKey = (): Uint8Array => randomBytes(aead.KEY_LEN);
export const generateDek = (): Uint8Array => randomBytes(aead.KEY_LEN);

/** `dek_wrapped = aead(MK, DEK, aad = item_id)`. */
export function wrapDek(mk: Uint8Array, dek: Uint8Array, itemId: string): Uint8Array {
  return aead.seal(mk, dek, itemId);
}

export function unwrapDek(mk: Uint8Array, wire: Uint8Array, itemId: string): Uint8Array {
  return aead.open(mk, wire, itemId);
}

/** `ciphertext = aead(DEK, json, aad = item_id)`. */
export function encryptItem(dek: Uint8Array, plaintext: string | Uint8Array, itemId: string) {
  return aead.seal(dek, asBytes(plaintext), itemId);
}

export function decryptItem(dek: Uint8Array, wire: Uint8Array, itemId: string): Uint8Array {
  return aead.open(dek, wire, itemId);
}

/** `mk_wrapped_pw = aead(KEK, MK, aad = user_id)`, the password path into the vault. */
export function wrapMk(kek: Uint8Array, mk: Uint8Array, userId: string): Uint8Array {
  return aead.seal(kek, mk, userId);
}

export function unwrapMk(kek: Uint8Array, wire: Uint8Array, userId: string): Uint8Array {
  return aead.open(kek, wire, userId);
}
