/**
 * signup: creates an account from an invite code (spec 0001-account-and-device-gate, AC-2, AC-3).
 * Anonymous. The password is the auth half of the split; the vault half never arrives here.
 */
import { writeAudit } from '../_shared/audit.ts';
import { buildDeviceRow, parseDeviceInput } from '../_shared/device.ts';
import { handle, HttpError, json, readJson } from '../_shared/errors.ts';
import { sha256Hex } from '../_shared/hash.ts';
import { serviceClient } from '../_shared/supabase.ts';

interface SignupBody {
  user_id: string;
  email: string;
  auth_secret: string;
  invite_code: string;
  display_name: string;
  kdf_params: Record<string, number>;
  mk_wrapped_pw: string;
  mk_wrapped_admin: string;
  mk_verifier: string;
  device: unknown;
}

const AUTH_SECRET = /^[A-Za-z0-9_-]{43}$/;
const INVITE = /^[0-9A-Z]{8}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const body = await readJson<Partial<SignupBody>>(req);
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    const code = String(body.invite_code ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '');
    const displayName = String(body.display_name ?? '')
      .trim()
      .slice(0, 60);
    const userId = String(body.user_id ?? '');
    // The phone picks the id so it can bind the wraps to it (AAD = user id) before the account exists.
    if (!UUID.test(userId)) throw new HttpError(400, 'bad_user_id');
    if (!email.includes('@')) throw new HttpError(400, 'bad_email');
    if (!AUTH_SECRET.test(String(body.auth_secret ?? '')))
      throw new HttpError(400, 'bad_auth_secret');
    if (!INVITE.test(code)) throw new HttpError(403, 'bad_invite');
    for (const key of ['mk_wrapped_pw', 'mk_wrapped_admin', 'mk_verifier'] as const) {
      if (typeof body[key] !== 'string' || body[key].length < 40)
        throw new HttpError(400, `bad_${key}`);
    }
    if (!body.kdf_params || typeof body.kdf_params.N !== 'number')
      throw new HttpError(400, 'bad_kdf_params');
    const device = parseDeviceInput(body.device);

    const db = serviceClient();

    // 1. The invite: allowlisted email, matching hash, unused, unexpired.
    const { data: invite } = await db
      .from('allowed_members')
      .select('email, label, invite_code_hash, invite_expires_at, consumed_at')
      .eq('email', email)
      .maybeSingle();
    const codeHash = await sha256Hex(new TextEncoder().encode(code));
    if (
      !invite ||
      invite.consumed_at ||
      !invite.invite_code_hash ||
      invite.invite_code_hash !== codeHash ||
      !invite.invite_expires_at ||
      new Date(invite.invite_expires_at).getTime() < Date.now()
    ) {
      await writeAudit(db, { action: 'signup.bad_invite', meta: { email } });
      throw new HttpError(403, 'bad_invite');
    }

    // 2. Auth user with the auth secret as the password.
    const { data: created, error: createError } = await db.auth.admin.createUser({
      id: userId,
      email,
      password: body.auth_secret as string,
      email_confirm: true,
    });
    if (createError || !created.user) {
      const msg = createError?.message ?? '';
      if (/already|exists|registered/i.test(msg)) throw new HttpError(409, 'email_exists');
      throw new HttpError(500, 'create_user_failed');
    }
    if (created.user.id !== userId) {
      await db.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      throw new HttpError(500, 'user_id_mismatch');
    }

    // 3. Profile, key material, pending device, consumed invite. Any failure removes the user again.
    try {
      const pending = await buildDeviceRow(req, userId, device, 'pending');
      const steps = [
        db.from('profiles').insert({
          id: userId,
          email,
          display_name: displayName || invite.label,
          role: 'member',
          status: 'pending',
          kdf_params: body.kdf_params,
        }),
        db.from('key_material').insert({
          user_id: userId,
          mk_wrapped_pw: body.mk_wrapped_pw,
          mk_wrapped_admin: body.mk_wrapped_admin,
          mk_verifier: body.mk_verifier,
        }),
        db.from('devices').insert(pending.row),
        db
          .from('allowed_members')
          .update({ consumed_at: new Date().toISOString() })
          .eq('email', email),
      ];
      for (const step of steps) {
        const { error } = await step;
        if (error) throw new Error(error.message);
      }
      await writeAudit(db, {
        actor_id: userId,
        actor_device_id: pending.id,
        action: 'signup',
        target_user_id: userId,
        meta: { email, label: invite.label, model: device.model },
      });
      return json({ user_id: userId, device_id: pending.id, device_token: pending.token }, 201);
    } catch (error) {
      await db.auth.admin.deleteUser(userId).catch(() => undefined);
      console.error('signup rollback', error instanceof Error ? error.message : String(error));
      throw new HttpError(500, 'signup_failed');
    }
  }),
);
