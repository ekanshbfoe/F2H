import { useLock } from '@/features/lock/lock.store';
import { AppKeys, appDelete, appGet, appSet } from '@/services/app-storage';
import { secureWipe } from '@/services/secure-store';
import { setDeviceToken, supabase } from '@/services/supabase';
import { useSession, type SessionProfile, type SessionPhase } from '@/state/session.store';

/**
 * Session helpers shared by the auth slice and the app lock. Nothing here imports `./api` or
 * `@/features/lock/api`, so both can import this file without a cycle.
 */

/** Reads the public profile row and caches it (no secrets) so an offline unlock still has a name. */
export async function loadProfile(userId: string): Promise<SessionProfile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, email, display_name, role, status')
    .eq('id', userId)
    .maybeSingle();
  if (data) await appSet(AppKeys.profile, JSON.stringify(data)).catch(() => undefined);
  return data ?? null;
}

/** The last profile this phone loaded, only when it belongs to the given user. */
export async function readCachedProfile(userId: string): Promise<SessionProfile | null> {
  const raw = await appGet(AppKeys.profile);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as SessionProfile;
    return p.id === userId ? p : null;
  } catch {
    return null;
  }
}

export async function adminNeedsFirstRun(profile: SessionProfile): Promise<boolean> {
  if (profile.role !== 'admin') return false;
  const { data } = await supabase
    .from('family_config')
    .select('admin_recovery_pubkey')
    .eq('id', 1)
    .maybeSingle();
  return !data?.admin_recovery_pubkey;
}

/**
 * Rejected, expired, revoked or wiped: every `f2h.*` secret, the token, the lock markers and the
 * cached profile go, the auth session ends and the lock store returns to `no_pin` (AC-13 of
 * spec 0001, the wipe of spec 0002).
 */
export async function wipeLocalState(phase: SessionPhase = 'signed_out'): Promise<void> {
  const s = useSession.getState();
  useLock.getState().bumpGeneration();
  await secureWipe();
  await setDeviceToken(null);
  await Promise.all([
    appDelete(AppKeys.backgroundAt),
    appDelete(AppKeys.profile),
    appDelete(AppKeys.adminApprovedCount),
  ]);
  await supabase.auth.signOut().catch(() => undefined);
  s.reset(phase);
  useLock.getState().set({ state: 'no_pin', failures: 0, cooldownMs: 0, busy: false });
}
