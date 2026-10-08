/**
 * self-approve-device: the Admin's pending phone proves the paper recovery kit
 * (spec 0001-admin-device-self-approval, AC-2, AC-4, AC-5, AC-6).
 *
 * step `challenge`: a one time X25519 public key; only sha256(expected tag) and a 10 minute expiry
 *   land on the pending row, the ephemeral secret is gone when the response leaves.
 * step `answer`: the phone's tag; `answer_admin_challenge` compares, counts, approves or rejects,
 *   revokes the other admin phones when asked and writes the audit rows in one transaction.
 */
import { requirePendingAdmin } from '../_shared/auth.ts';
import {
  CHALLENGE_TTL_MS,
  issueChallenge,
  MAX_ATTEMPTS,
  MAX_CHALLENGES,
  TAG_LEN,
  tagHashOf,
} from '../_shared/challenge.ts';
import { handle, HttpError, json, readJson } from '../_shared/errors.ts';
import { base64ToBytes, bytesToBase64 } from '../_shared/hash.ts';
import { sendPush } from '../_shared/push.ts';
import { serviceClient } from '../_shared/supabase.ts';

interface Body {
  step?: string;
  tag?: string;
  revoke_others?: boolean;
}

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const caller = await requirePendingAdmin(req);
    const body = await readJson<Body>(req);
    const db = serviceClient();
    const { data: row } = await db
      .from('devices')
      .select('model, challenge_count, challenge_attempts')
      .eq('id', caller.device.id)
      .maybeSingle();
    if (!row) throw new HttpError(500, 'device_row_missing');

    if (body.step === 'challenge') {
      if (row.challenge_count >= MAX_CHALLENGES) throw new HttpError(409, 'too_many_challenges');
      const issued = issueChallenge(caller.recoveryPub, caller.device.id);
      const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
      const { data: updated, error } = await db
        .from('devices')
        .update({
          challenge_hash: issued.tagHash,
          challenge_expires_at: expiresAt,
          challenge_count: row.challenge_count + 1,
        })
        .eq('id', caller.device.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (error || !updated) throw new HttpError(409, 'device_not_pending');
      return json({
        eph_pub: bytesToBase64(issued.ephPub),
        expires_at: expiresAt,
        attempts_left: MAX_ATTEMPTS - row.challenge_attempts,
      });
    }

    if (body.step === 'answer') {
      let tag: Uint8Array;
      try {
        tag = base64ToBytes(String(body.tag ?? ''));
      } catch {
        throw new HttpError(400, 'bad_tag_format');
      }
      if (tag.length !== TAG_LEN) throw new HttpError(400, 'bad_tag_format');
      const revokeOthers = body.revoke_others === true;

      // The phones to tell, read before the RPC may revoke them.
      const { data: others } = await db
        .from('devices')
        .select('push_token')
        .eq('user_id', caller.user.id)
        .eq('status', 'approved')
        .neq('id', caller.device.id);

      const { data, error } = await db.rpc('answer_admin_challenge', {
        p_device_id: caller.device.id,
        p_tag_hash: tagHashOf(tag),
        p_revoke_others: revokeOthers,
      });
      tag.fill(0);
      if (error) {
        if (error.code === 'P0001') throw new HttpError(409, 'device_not_pending');
        if (error.code === 'P0002') throw new HttpError(404, 'device_not_found');
        throw new HttpError(500, 'answer_failed');
      }
      const result = (Array.isArray(data) ? data[0] : data) as
        | { outcome: 'approved' | 'wrong' | 'expired' | 'rejected'; attempts_left: number }
        | undefined;
      if (!result) throw new HttpError(500, 'answer_failed');

      switch (result.outcome) {
        case 'approved': {
          const { data: profile } = await db
            .from('profiles')
            .select('display_name')
            .eq('id', caller.user.id)
            .maybeSingle();
          await sendPush(
            (others ?? []).map((d) => d.push_token),
            {
              title: 'Admin account recovered',
              body: `${profile?.display_name ?? 'The Admin'} recovered the admin account with the paper kit on ${row.model}${revokeOthers ? '. This phone was signed out.' : '.'}`,
              data: { kind: 'admin_recovered', device_id: caller.device.id },
            },
          );
          return json({ status: 'approved', attempts_left: result.attempts_left });
        }
        case 'wrong':
          return json(
            {
              error: { code: 'wrong_tag', message: 'the recovery words did not prove the kit' },
              attempts_left: result.attempts_left,
            },
            409,
          );
        case 'expired':
          return json(
            {
              error: { code: 'challenge_expired', message: 'ask for a new challenge' },
              attempts_left: result.attempts_left,
            },
            409,
          );
        case 'rejected':
          return json({ status: 'rejected', attempts_left: 0 });
        default:
          throw new HttpError(500, 'answer_failed');
      }
    }

    throw new HttpError(400, 'bad_step');
  }),
);
