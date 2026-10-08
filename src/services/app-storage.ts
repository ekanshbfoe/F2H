import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Plain (not secret) settings and markers in AsyncStorage. Nothing here is key material: the
 * lock timeout, when the app last left the foreground, and a cache of the public profile row.
 */
export const AppKeys = {
  lockTimeoutMs: 'f2h.lock_timeout_ms',
  backgroundAt: 'f2h.background_at',
  profile: 'f2h.profile',
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
