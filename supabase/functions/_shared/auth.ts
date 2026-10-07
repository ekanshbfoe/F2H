import type { User } from '@supabase/supabase-js';

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

/** Internal calls from pg_cron and database triggers carry the service role key as a bearer token. */
export function requireServiceCall(req: Request): void {
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const got = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!expected || got !== expected) throw new HttpError(401, 'service_key_required');
}
