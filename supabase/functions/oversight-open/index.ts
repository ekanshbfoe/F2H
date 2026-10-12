/**
 * oversight-open (spec 0005, AC-1, AC-2): the Admin, on an approved phone, opens a member's vault
 * read only. The audit row is written first; if it cannot be written nothing is returned. Then the
 * member is pushed and the Admin gets the member's sealed wrap, verifier and live ciphertext rows,
 * which only the Admin phone can open with the recovery key.
 */
import { requireAdmin } from '../_shared/auth.ts';
import { handle, HttpError, json, readJson } from '../_shared/errors.ts';
import { sendPush } from '../_shared/push.ts';
import { serviceClient } from '../_shared/supabase.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const admin = await requireAdmin(req);
    const { member_id } = await readJson<{ member_id?: string }>(req);
    const memberId = String(member_id ?? '');
    if (!UUID.test(memberId)) throw new HttpError(400, 'bad_member');
    if (memberId === admin.user.id) throw new HttpError(400, 'own_vault');

    const db = serviceClient();
    const { data: km } = await db
      .from('key_material')
      .select('mk_wrapped_admin, mk_verifier')
      .eq('user_id', memberId)
      .maybeSingle();
    if (!km) throw new HttpError(404, 'member_not_found');
    const { data: rows, error: rowsError } = await db
      .from('vault_items')
      .select('id, kind, version, dek_wrapped, ciphertext')
      .eq('owner_id', memberId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(5000);
    if (rowsError) throw new HttpError(500, 'read_failed');
    const counts: Record<string, number> = {};
    for (const r of rows ?? []) counts[r.kind] = (counts[r.kind] ?? 0) + 1;

    const { error: auditError } = await db.from('audit_log').insert({
      actor_id: admin.user.id,
      actor_device_id: admin.device.id,
      action: 'oversight.open',
      target_user_id: memberId,
      meta: { counts },
    });
    if (auditError) throw new HttpError(500, 'audit_failed');

    const [{ data: adminProfile }, { data: devices }] = await Promise.all([
      db.from('profiles').select('display_name').eq('id', admin.user.id).maybeSingle(),
      db.from('devices').select('push_token').eq('user_id', memberId).eq('status', 'approved'),
    ]);
    await sendPush(
      (devices ?? []).map((d) => d.push_token),
      {
        title: 'The Admin opened your vault',
        body: `${adminProfile?.display_name ?? 'The Admin'} is viewing your vault read only. It is in your Activity log.`,
        data: { screen: 'activity' },
      },
    );

    return json({
      mk_wrapped_admin: km.mk_wrapped_admin,
      mk_verifier: km.mk_verifier,
      items: rows ?? [],
    });
  }),
);
