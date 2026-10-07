import * as aead from './aead';
import { equalBytes, utf8ToBytes } from './encoding';
import { CryptoError } from './errors';

const CHECK = utf8ToBytes('f2h:mk-check');

/** `mk_verifier = aead(MK, "f2h:mk-check", aad = user_id)`. */
export function make(mk: Uint8Array, userId: string): Uint8Array {
  return aead.seal(mk, CHECK, userId);
}

/** True when `wire` was made with this MK for this user; false on any failure, never throws for a wrong key. */
export function check(mk: Uint8Array, userId: string, wire: Uint8Array): boolean {
  try {
    return equalBytes(aead.open(mk, wire, userId), CHECK);
  } catch (error) {
    if (error instanceof CryptoError) return false;
    throw error;
  }
}
