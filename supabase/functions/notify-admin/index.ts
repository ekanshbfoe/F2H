/**
 * notify-admin: database webhook on devices INSERT (AC-8). Called by the devices_notify_admin trigger
 * through pg_net with the service role key as the bearer token.
 */
import { requireServiceCall } from '../_shared/auth.ts';
import { handle, HttpError, json, readJson } from '../_shared/errors.ts';
import { sendPush } from '../_shared/push.ts';
import { serviceClient } from '../_shared/supabase.ts';

interface WebhookBody {
  type?: string;
  table?: string;
  record?: {
    id: string;
    user_id: string;
    status: string;
    model?: string;
    last_geo?: { city?: string | null; country_code?: string | null } | null;
  };
}

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    await requireServiceCall(req);
    const body = await readJson<WebhookBody>(req);
    const record = body.record;
    if (!record || body.table !== 'devices' || record.status !== 'pending')
      return json({ ok: true, skipped: true });

    const db = serviceClient();
    const { data: profile } = await db
      .from('profiles')
      .select('display_name')
      .eq('id', record.user_id)
      .maybeSingle();
    const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin');
    const adminIds = (admins ?? []).map((a) => a.id);
    if (adminIds.length === 0) return json({ ok: true, admins: 0 });
    const { data: adminDevices } = await db
      .from('devices')
      .select('push_token')
      .in('user_id', adminIds)
      .eq('status', 'approved')
      .not('push_token', 'is', null);

    const where = [record.last_geo?.city, record.last_geo?.country_code].filter(Boolean).join(', ');
    const tickets = await sendPush(
      (adminDevices ?? []).map((d) => d.push_token),
      {
        title: 'Approval needed',
        body: `${profile?.display_name ?? 'A member'} wants to sign in from ${record.model ?? 'a phone'}${where ? ` in ${where}` : ''}.`,
        data: { screen: 'approvals', device_id: record.id },
      },
    );
    return json({ ok: true, pushed: tickets.length });
  }),
);
