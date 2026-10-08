/**
 * register-device: a new phone for an existing account waits for the Admin (AC-6), except the very
 * first Admin device, which is approved on the spot (AC-4). A retry with the same nonce is only
 * honoured while that request is still pending: a token is never reissued for an approved device,
 * so knowing a nonce (or the password) does not take a device over.
 */
import { requireUser } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { buildDeviceRow, parseDeviceInput, rotateToken } from '../_shared/device.ts';
import { handle, HttpError, json, readJson } from '../_shared/errors.ts';
import { serviceClient } from '../_shared/supabase.ts';

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const user = await requireUser(req);
    const body = await readJson<{ device?: unknown; nonce?: string; replace_pending?: boolean }>(
      req,
    );
    const input = parseDeviceInput({ ...(body.device as object), nonce: body.nonce });
    const db = serviceClient();

    // Same nonce again: a retry of a request that is still waiting gets the same row and a fresh
    // token. Any other status means the nonce is spent; the phone must start a new registration.
    const { data: existing } = await db
      .from('devices')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('registration_nonce', input.nonce)
      .maybeSingle();
    if (existing) {
      if (existing.status !== 'pending') {
        return json(
          {
            error: { code: 'nonce_used', message: 'this registration is closed' },
            status: existing.status,
          },
          409,
        );
      }
      const token = await rotateToken(db, existing.id);
      return json({ device_id: existing.id, device_token: token, status: 'pending' });
    }

    const { data: config } = await db
      .from('family_config')
      .select('admin_user_id, admin_recovery_pubkey')
      .eq('id', 1)
      .maybeSingle();
    const isAdmin = config?.admin_user_id === user.id;

    // One pending request per user. The Admin may replace a foreign pending row of their own
    // account (spec 0001-admin-device-self-approval, AC-8): the old row expires with an audit row
    // so a password holder cannot hold the single pending slot against the real Admin.
    const { data: pending } = await db
      .from('devices')
      .select('id, model')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (pending) {
      if (!(body.replace_pending === true && isAdmin)) {
        return json(
          {
            error: { code: 'pending_exists', message: 'a request is already waiting' },
            device_id: pending.id,
          },
          409,
        );
      }
      const { data: replaced, error: replaceError } = await db
        .from('devices')
        .update({ status: 'expired', decided_at: new Date().toISOString() })
        .eq('id', pending.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (replaceError || !replaced) throw new HttpError(500, 'replace_failed');
      await writeAudit(db, {
        actor_id: user.id,
        action: 'device.replaced',
        target_user_id: user.id,
        meta: { device_id: pending.id, model: pending.model },
      });
    }

    // True first run only: this is the Admin, the recovery key was never published, and the Admin
    // has no device row of any status. Later, a pending Admin phone proves the paper kit instead.
    let status: 'pending' | 'approved' = 'pending';
    if (isAdmin && !config?.admin_recovery_pubkey) {
      const { count } = await db
        .from('devices')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      if ((count ?? 0) === 0) status = 'approved';
    }

    const device = await buildDeviceRow(req, user.id, input, status);
    const { error } = await db.from('devices').insert(device.row);
    if (error) {
      if (error.code === '23505') {
        return json(
          { error: { code: 'pending_exists', message: 'a request is already waiting' } },
          409,
        );
      }
      throw new HttpError(500, 'register_failed');
    }
    await writeAudit(db, {
      actor_id: user.id,
      actor_device_id: device.id,
      action: status === 'approved' ? 'device.auto_approved' : 'device.register',
      target_user_id: user.id,
      meta: {
        model: input.model,
        os: input.os,
        city: (device.row.last_geo as { city?: string } | null)?.city ?? null,
      },
    });
    return json({ device_id: device.id, device_token: device.token, status }, 201);
  }),
);
