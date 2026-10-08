import { challenge, equalBytes, fromBase64, mnemonic, recovery, toBase64, zero } from '@/crypto';
import { fetchRecoveryPubkey } from '@/features/auth/api';
import { callFunction, FunctionError } from '@/services/functions';
import { SecureKeys, secureGet } from '@/services/secure-store';
import { supabase } from '@/services/supabase';
import { useSession } from '@/state/session.store';

export { countMyApprovedDevices } from './approved-count';

/**
 * Admin device self approval (spec 0001-admin-device-self-approval). The 24 words are checked on
 * the phone first (AC-3); then one burst: challenge, tag, answer (AC-2, AC-4, AC-5). The seed and
 * the derived secret key live only inside `selfApprove` and are zeroed on every path.
 */

export type WordsCheck = { ok: true } | { ok: false; reason: 'count' | 'checksum' | 'mismatch' };

/** Local checks only, no network: all 24 present, checksum valid, public key equals the published one. */
export function checkRecoveryWords(words: string[], recoveryPubB64: string): WordsCheck {
  if (words.length !== mnemonic.WORD_COUNT || words.some((w) => w.trim().length === 0)) {
    return { ok: false, reason: 'count' };
  }
  if (!mnemonic.isValid(words)) return { ok: false, reason: 'checksum' };
  const seed = mnemonic.toSeed(words);
  const pair = recovery.deriveRecoveryKeypair(seed);
  zero(seed);
  zero(pair.secretKey);
  let published: Uint8Array;
  try {
    published = fromBase64(recoveryPubB64);
  } catch {
    return { ok: false, reason: 'mismatch' };
  }
  return equalBytes(pair.publicKey, published) ? { ok: true } : { ok: false, reason: 'mismatch' };
}

export type SelfApproveOutcome =
  | { kind: 'approved' }
  | { kind: 'wrong'; attemptsLeft: number }
  | { kind: 'rejected' }
  /** the row is no longer pending (approved elsewhere, cancelled, expired): let the watcher decide */
  | { kind: 'not_pending' }
  | { kind: 'too_many_challenges' }
  | { kind: 'network'; message: string };

interface ChallengeResponse {
  eph_pub: string;
  expires_at: string;
  attempts_left: number;
}

interface AnswerResponse {
  status: 'approved' | 'rejected';
  attempts_left: number;
}

function classify(e: unknown): SelfApproveOutcome | null {
  if (!(e instanceof FunctionError)) return null;
  if (e.status === 0) return { kind: 'network', message: e.code };
  switch (e.code) {
    case 'device_not_pending':
    case 'device_not_found':
      return { kind: 'not_pending' };
    case 'too_many_challenges':
      return { kind: 'too_many_challenges' };
    case 'admin_required':
    case 'recovery_not_published':
      return { kind: 'network', message: e.code };
    default:
      return null;
  }
}

/**
 * Proves the kit for this pending phone. On `challenge_expired` or one `wrong_tag` the burst runs
 * again once with a fresh challenge (the outcome mapping of the spec); a second wrong tag reports
 * the tries left. Never decrypts anything: the only output is an HKDF tag bound to this device id.
 */
export async function selfApprove(
  words: string[],
  revokeOthers: boolean,
): Promise<SelfApproveOutcome> {
  const deviceId = useSession.getState().deviceId ?? (await secureGet(SecureKeys.deviceId));
  if (!deviceId) return { kind: 'not_pending' };
  const published = await fetchRecoveryPubkey();
  if (!published) return { kind: 'network', message: 'recovery_key_unavailable' };
  const recoveryPub = fromBase64(published.recovery_pub);
  const seed = mnemonic.toSeed(words);
  const pair = recovery.deriveRecoveryKeypair(seed);
  zero(seed);
  try {
    let retried = false;
    for (;;) {
      let issued: ChallengeResponse;
      try {
        issued = await callFunction<ChallengeResponse>('self-approve-device', {
          step: 'challenge',
        });
      } catch (e) {
        const known = classify(e);
        if (known) return known;
        throw e;
      }
      const tag = challenge.answerTag(
        pair.secretKey,
        fromBase64(issued.eph_pub),
        recoveryPub,
        deviceId,
      );
      const tagB64 = toBase64(tag);
      zero(tag);
      try {
        const answer = await callFunction<AnswerResponse>('self-approve-device', {
          step: 'answer',
          tag: tagB64,
          revoke_others: revokeOthers,
        });
        return answer.status === 'approved' ? { kind: 'approved' } : { kind: 'rejected' };
      } catch (e) {
        if (e instanceof FunctionError && e.code === 'challenge_expired' && !retried) {
          retried = true;
          continue;
        }
        if (e instanceof FunctionError && e.code === 'wrong_tag') {
          const attemptsLeft = Number(e.payload?.attempts_left ?? 0);
          if (!retried && attemptsLeft > 0) {
            retried = true;
            continue;
          }
          return { kind: 'wrong', attemptsLeft };
        }
        const known = classify(e);
        if (known) return known;
        throw e;
      }
    }
  } finally {
    zero(pair.secretKey);
  }
}

export interface OtherDevice {
  id: string;
  model: string;
  name: string;
  os: string;
  last_seen_at: string;
  status: string;
}

/** The Admin's other approved phones, read by the newly approved phone (AC-6). */
export async function listOtherApprovedDevices(): Promise<OtherDevice[]> {
  const s = useSession.getState();
  const deviceId = s.deviceId ?? (await secureGet(SecureKeys.deviceId));
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return [];
  let query = supabase
    .from('member_devices_view')
    .select('id, model, name, os, last_seen_at, status')
    .eq('user_id', uid)
    .eq('status', 'approved')
    .order('last_seen_at', { ascending: false });
  if (deviceId) query = query.neq('id', deviceId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    id: String(d.id),
    model: d.model ?? '',
    name: d.name ?? '',
    os: d.os ?? '',
    last_seen_at: d.last_seen_at ?? '',
    status: String(d.status ?? ''),
  }));
}

/** Signs out one of the Admin's other phones (AC-6). The RPC refuses the caller's own phone. */
export async function revokeOtherDevice(deviceId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_revoke_device', { p_device_id: deviceId });
  if (error) throw new Error(error.message);
}
