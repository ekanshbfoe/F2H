import type { User } from 'npm:@supabase/supabase-js@2';

import { byteaToBytes } from './challenge.ts';
import { HttpError } from './errors.ts';
import { base64ToBytes, sha256Hex } from './hash.ts';
import { serviceClient, userClient } from './supabase.ts';

export interface DeviceRow {
  id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired';
  push_token: string | null;
}

export interface Caller {
  user: User;
  device: DeviceRow;
}

/** The signed in user from the Authorization header, or 401. */
export async function requireUser(req: Request): Promise<User> {
  const { data, error } = await userClient(req).auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'unauthenticated');
  return data.user;
}

/** The device named by `x-f2h-device` for this user, in any status, or null. */
export async function findDevice(userId: string, req: Request): Promise<DeviceRow | null> {
  const header = req.headers.get('x-f2h-device');
  if (!header) return null;
  let tokenHash: string;
  try {
    tokenHash = await sha256Hex(base64ToBytes(header));
  } catch {
    throw new HttpError(400, 'bad_device_header');
  }
  const { data } = await serviceClient()
    .from('devices')
    .select('id, user_id, status, push_token')
    .eq('user_id', userId)
    .eq('token_hash', tokenHash)
    .maybeSingle();
  return (data as DeviceRow | null) ?? null;
}

/** Signed in user plus an approved device, or 401 / 403 (`device_not_approved`). */
export async function requireApprovedDevice(req: Request): Promise<Caller> {
  const user = await requireUser(req);
  const device = await findDevice(user.id, req);
  if (!device || device.status !== 'approved') throw new HttpError(403, 'device_not_approved');
  const { data: profile } = await serviceClient()
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.status !== 'active') throw new HttpError(403, 'profile_not_active');
  return { user, device };
}

/** Approved device whose profile is the Admin, or 403 (`admin_required`). */
export async function requireAdmin(req: Request): Promise<Caller> {
  const caller = await requireApprovedDevice(req);
  const { data } = await serviceClient()
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .maybeSingle();
  if (!data || data.role !== 'admin') throw new HttpError(403, 'admin_required');
  return caller;
}

export interface PendingAdmin extends Caller {
  /** the published recovery public key, 32 bytes */
  recoveryPub: Uint8Array;
}

/**
 * The Admin on their own `pending` phone, with the recovery key published (self approval, spec
 * 0001-admin-device-self-approval AC-2): 403 `admin_required` for anyone else, `device_not_pending`
 * when the header names no pending row of theirs, `recovery_not_published` before the first run.
 */
export async function requirePendingAdmin(req: Request): Promise<PendingAdmin> {
  const user = await requireUser(req);
  const db = serviceClient();
  const { data: profile } = await db
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
    throw new HttpError(403, 'admin_required');
  }
  const { data: config } = await db
    .from('family_config')
    .select('admin_user_id, admin_recovery_pubkey')
    .eq('id', 1)
    .maybeSingle();
  if (!config || config.admin_user_id !== user.id) throw new HttpError(403, 'admin_required');
  const device = await findDevice(user.id, req);
  if (!device || device.status !== 'pending') throw new HttpError(403, 'device_not_pending');
  if (!config.admin_recovery_pubkey) throw new HttpError(403, 'recovery_not_published');
  let recoveryPub: Uint8Array;
  try {
    recoveryPub = byteaToBytes(String(config.admin_recovery_pubkey));
  } catch {
    throw new HttpError(500, 'recovery_key_unreadable');
  }
  if (recoveryPub.length !== 32) throw new HttpError(500, 'recovery_key_unreadable');
  return { user, device, recoveryPub };
}

/**
 * Internal calls from pg_cron, database triggers and the keep alive carry the service role key as
 * the bearer token. Equality with the injected env key is the fast path; otherwise the key is
 * proven by a probe of the auth admin endpoint, which only a valid service key can pass.
 */
export async function requireServiceCall(req: Request): Promise<void> {
  const got = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!got) throw new HttpError(401, 'service_key_required');
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (expected && got === expected) return;
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new HttpError(500, 'config_missing', 'SUPABASE_URL is not set');
  const probe = await fetch(`${url}/auth/v1/admin/users?per_page=1`, {
    headers: { apikey: got, Authorization: `Bearer ${got}` },
  });
  if (!probe.ok) throw new HttpError(401, 'service_key_required');
}
