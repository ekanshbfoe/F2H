import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Plain (not secret) settings and markers in AsyncStorage. Nothing here is key material: the
 * lock timeout, when the app last left the foreground, a cache of the public profile row and the
 * Admin's approved device count for the last phone warning.
 */
export const AppKeys = {
  lockTimeoutMs: 'f2h.lock_timeout_ms',
  backgroundAt: 'f2h.background_at',
  profile: 'f2h.profile',
  /** Approved devices of the Admin, this phone included; written only for the admin role (spec 0001 self approval, AC-7). */
  adminApprovedCount: 'f2h.admin_approved_count',
  /** The first launch deck was finished or skipped on this phone (spec 0007); kept on wipe. */
  onboarded: 'f2h.onboarded',
} as const;

export type AppKey = (typeof AppKeys)[keyof typeof AppKeys];

export async function appGet(key: AppKey): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function appSet(key: AppKey, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function appDelete(key: AppKey): Promise<void> {
  await AsyncStorage.removeItem(key);
}
