/**
 * approve-device: the Admin's decision (AC-11). One SQL transaction flips the device and the profile,
 * writes the audit row, then the requester is pushed.
 */
import { requireAdmin } from '../_shared/auth.ts';
import { handle, HttpError, json, readJson } from '../_shared/errors.ts';
import { sendPush } from '../_shared/push.ts';
import { serviceClient } from '../_shared/supabase.ts';

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const admin = await requireAdmin(req);
    const body = await readJson<{ device_id?: string; decision?: string }>(req);
    const deviceId = String(body.device_id ?? '');
    const decision =
      body.decision === 'approve' ? 'approve' : body.decision === 'reject' ? 'reject' : null;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId)
    ) {
      throw new HttpError(400, 'bad_device_id');
    }
    if (!decision) throw new HttpError(400, 'bad_decision');

    const db = serviceClient();
    const { data, error } = await db.rpc('decide_device', {
      p_device_id: deviceId,
      p_decision: decision,
      p_admin_id: admin.user.id,
      p_admin_device_id: admin.device.id,
    });
    if (error) {
      if (error.code === 'P0002') throw new HttpError(404, 'device_not_found');
      if (error.code === 'P0001') throw new HttpError(409, 'device_not_pending');
      throw new HttpError(500, 'decide_failed');
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { status: string; user_id: string; push_token: string | null; display_name: string }
      | undefined;
    if (!row) throw new HttpError(500, 'decide_failed');

    await sendPush([row.push_token], {
      title: decision === 'approve' ? 'Device approved' : 'Device rejected',
      body:
        decision === 'approve'
          ? 'The Admin approved this phone. Open F2H to finish setting up.'
          : 'The Admin rejected this phone.',
      data: { screen: 'waiting', device_id: deviceId, status: row.status },
    });
    return json({ status: row.status });
  }),
);
