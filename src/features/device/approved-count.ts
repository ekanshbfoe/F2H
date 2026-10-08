import { AppKeys, appGet, appSet } from '@/services/app-storage';
import { supabase } from '@/services/supabase';

/**
 * How many approved phones the signed in account has, this phone included (self approval spec,
 * AC-1, AC-7). The owner policy on `devices` has no device check, so a pending phone can ask; the
 * Admin also sees every row, hence the explicit owner filter. Null on any error (offline).
 *
 * This file imports no feature module so the lock api can use it without a cycle.
 */
export async function countMyApprovedDevices(): Promise<number | null> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return null;
  const { count, error } = await supabase
    .from('devices')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .eq('status', 'approved');
  if (error) return null;
  return count ?? 0;
}

/** The cached count the Forgot PIN warning reads offline. Written only for the admin role. */
export async function cacheAdminApprovedCount(n: number): Promise<void> {
  await appSet(AppKeys.adminApprovedCount, String(n));
}

export async function readCachedAdminApprovedCount(): Promise<number | null> {
  const raw = await appGet(AppKeys.adminApprovedCount);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}
