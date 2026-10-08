/**
 * reset-password: a member on an approved device redeems an Admin recovery grant (AC-15).
 * The device already unsealed its Master Key with the grant; here the auth password and the
 * password wrap are replaced and the grant is consumed.
 */
import { findDevice, requireUser } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handle, HttpError, json, readJson } from '../_shared/errors.ts';
import { serviceClient } from '../_shared/supabase.ts';

const AUTH_SECRET = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const user = await requireUser(req);
    const device = await findDevice(user.id, req);
    if (!device || device.status !== 'approved') throw new HttpError(403, 'device_not_approved');
    const body = await readJson<{
      grant_id?: string;
      new_auth_secret?: string;
      new_mk_wrapped_pw?: string;
    }>(req);
    const grantId = String(body.grant_id ?? '');
    if (!UUID.test(grantId)) throw new HttpError(400, 'bad_grant_id');
    if (!AUTH_SECRET.test(String(body.new_auth_secret ?? '')))
      throw new HttpError(400, 'bad_auth_secret');
    if (typeof body.new_mk_wrapped_pw !== 'string' || body.new_mk_wrapped_pw.length < 40) {
      throw new HttpError(400, 'bad_mk_wrapped_pw');
    }

    const db = serviceClient();
    // Claim the grant in one conditional update so it can be redeemed exactly once.
    const { data: claimed, error: claimError } = await db
      .from('recovery_grants')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', grantId)
      .eq('member_id', user.id)
      .eq('device_id', device.id)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle();
    if (claimError || !claimed) throw new HttpError(403, 'grant_invalid');

    const { error: pwError } = await db.auth.admin.updateUserById(user.id, {
      password: body.new_auth_secret,
    });
    const release = () =>
      db.from('recovery_grants').update({ consumed_at: null }).eq('id', grantId);
    if (pwError) {
      await release();
      throw new HttpError(500, 'password_update_failed');
    }
    const { error: kmError } = await db
      .from('key_material')
      .update({ mk_wrapped_pw: body.new_mk_wrapped_pw, updated_by_device: device.id })
      .eq('user_id', user.id);
    if (kmError) {
      await release();
      throw new HttpError(500, 'key_material_update_failed');
    }
    await writeAudit(db, {
      actor_id: user.id,
      actor_device_id: device.id,
      action: 'password.reset',
      target_user_id: user.id,
      meta: { grant_id: grantId },
    });
    return json({ ok: true });
  }),
);
