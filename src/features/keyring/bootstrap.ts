import { box, envelope, fromBase64, toBase64, verifier } from '@/crypto';

export interface MemberKeyMaterial {
  mk: Uint8Array;
  mk_wrapped_pw: string;
  mk_wrapped_admin: string;
  mk_verifier: string;
}

/**
 * First device of a member (or the Admin's first run): a fresh Master Key wrapped three ways.
 * `recoveryPub` is the Admin recovery public key, base64, from `rpc/recovery_pubkey`.
 */
export function createMemberKeys(
  kek: Uint8Array,
  userId: string,
  recoveryPub: string,
): MemberKeyMaterial {
  const mk = envelope.generateMasterKey();
  return {
    mk,
    mk_wrapped_pw: toBase64(envelope.wrapMk(kek, mk, userId)),
    mk_wrapped_admin: toBase64(box.seal(fromBase64(recoveryPub), mk)),
    mk_verifier: toBase64(verifier.make(mk, userId)),
  };
}
