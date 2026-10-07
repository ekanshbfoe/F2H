import { CryptoError, envelope, fromBase64, verifier } from '@/crypto';
import { supabase } from '@/services/supabase';

export class UnlockError extends Error {
  constructor(readonly code: 'not_released' | 'verifier_failed' | 'bad_wrap') {
    super(code);
    this.name = 'UnlockError';
  }
}

/**
 * After approval: read `mk_wrapped_pw` (visible only to an approved device with an active
 * profile), unwrap it with the in memory KEK and prove it with the verifier (AC-12).
 * Before approval the same select returns no row and this throws `not_released`.
 */
export async function unlockWithKek(kek: Uint8Array, userId: string): Promise<Uint8Array> {
  const { data, error } = await supabase
    .from('key_material')
    .select('mk_wrapped_pw, mk_verifier')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) throw new UnlockError('not_released');
  let mk: Uint8Array;
  try {
    mk = envelope.unwrapMk(kek, fromBase64(data.mk_wrapped_pw), userId);
  } catch (e) {
    if (e instanceof CryptoError) throw new UnlockError('bad_wrap');
    throw e;
  }
  if (!verifier.check(mk, userId, fromBase64(data.mk_verifier)))
    throw new UnlockError('verifier_failed');
  return mk;
}

/** True once the server lets this device read its key material (approved and active). */
export async function keyMaterialReleased(userId: string): Promise<boolean> {
  const { data } = await supabase.from('key_material').select('user_id').eq('user_id', userId);
  return (data?.length ?? 0) > 0;
}
