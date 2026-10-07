/**
 * expire-requests: hourly cron (AC-14). Pending devices older than 24 h become expired and are told;
 * invite codes past their expiry are voided.
 */
import { requireServiceCall } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handle, HttpError, json } from '../_shared/errors.ts';
import { sendPush } from '../_shared/push.ts';
import { serviceClient } from '../_shared/supabase.ts';

const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    await requireServiceCall(req);
    const db = serviceClient();
    const cutoff = new Date(Date.now() - PENDING_TTL_MS).toISOString();

    const { data: stale } = await db
      .from('devices')
      .select('id, user_id, push_token')
      .eq('status', 'pending')
      .lt('requested_at', cutoff);
    const staleIds = (stale ?? []).map((d) => d.id);
    if (staleIds.length > 0) {
      const { error } = await db
        .from('devices')
        .update({ status: 'expired', decided_at: new Date().toISOString() })
        .in('id', staleIds)
        .eq('status', 'pending');
      if (error) throw new HttpError(500, 'expire_failed');
      for (const d of stale ?? []) {
        await writeAudit(db, {
          action: 'device.expired',
          target_user_id: d.user_id,
          meta: { device_id: d.id },
        });
      }
      await sendPush(
        (stale ?? []).map((d) => d.push_token),
        {
          title: 'Request expired',
          body: 'The Admin did not approve this phone within a day. Sign in again to retry.',
          data: { screen: 'waiting', status: 'expired' },
        },
      );
    }

    const { data: invites } = await db
      .from('allowed_members')
      .select('email')
      .is('consumed_at', null)
      .not('invite_code_hash', 'is', null)
      .lt('invite_expires_at', new Date().toISOString());
    const emails = (invites ?? []).map((i) => i.email);
    if (emails.length > 0) {
      await db.from('allowed_members').update({ invite_code_hash: null }).in('email', emails);
      await writeAudit(db, { action: 'invite.expired', meta: { count: emails.length } });
    }

    return json({ ok: true, expired_devices: staleIds.length, voided_invites: emails.length });
  }),
);
