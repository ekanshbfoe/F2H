/**
 * register-device: a new phone for an existing account waits for the Admin (AC-6), except the very
 * first Admin device, which is approved on the spot (AC-4). Idempotent by nonce.
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
    const body = await readJson<{ device?: unknown; nonce?: string }>(req);
    const input = parseDeviceInput({ ...(body.device as object), nonce: body.nonce });
    const db = serviceClient();

    // Same nonce again (a retry): same row, fresh token.
    const { data: existing } = await db
      .from('devices')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('registration_nonce', input.nonce)
      .maybeSingle();
    if (existing) {
      const token = await rotateToken(db, existing.id);
      return json({ device_id: existing.id, device_token: token, status: existing.status });
    }

    // One pending request per user.
    const { data: pending } = await db
      .from('devices')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (pending) {
      return json(
        {
          error: { code: 'pending_exists', message: 'a request is already waiting' },
          device_id: pending.id,
        },
        409,
      );
    }

    // First Admin device: auto approve when this is the Admin and no approved Admin device exists.
    const { data: config } = await db
      .from('family_config')
      .select('admin_user_id')
      .eq('id', 1)
      .maybeSingle();
    let status: 'pending' | 'approved' = 'pending';
    if (config?.admin_user_id === user.id) {
      const { count } = await db
        .from('devices')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'approved');
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
