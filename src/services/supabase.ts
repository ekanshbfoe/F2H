import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

import { SecureKeys, secureDelete, secureGet, secureSet } from './secure-store';

export const DEVICE_HEADER = 'x-f2h-device';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set (.env)');
}

let deviceToken: string | null = null;

/** The base64 device token currently sent as `x-f2h-device`, or null before registration. */
export function getDeviceToken(): string | null {
  return deviceToken;
}

/** Sets the header for every following request and persists the token in SecureStore. */
export async function setDeviceToken(token: string | null): Promise<void> {
  deviceToken = token;
  if (token) await secureSet(SecureKeys.deviceToken, token);
  else await secureDelete(SecureKeys.deviceToken);
}

/** Loads the persisted token at boot so the first request already carries the header. */
export async function loadDeviceToken(): Promise<string | null> {
  deviceToken = await secureGet(SecureKeys.deviceToken);
  return deviceToken;
}

let forbiddenHandler: (() => void) | null = null;

/** Installed by the app lock: runs when a request answers 403 `device_not_approved` (spec 0002, AC-10). */
export function setForbiddenHandler(handler: (() => void) | null): void {
  forbiddenHandler = handler;
}

/** True when a 403 body carries the Edge Function code `device_not_approved`; a plain 403 is not it. */
export async function isDeviceNotApproved(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const body = (await res.clone().json()) as { error?: { code?: string } } | null;
    return body?.error?.code === 'device_not_approved';
  } catch {
    return false;
  }
}

/** Adds the device header when a token exists. Realtime uses the JWT only; it never sees this header. */
export const fetchWithDeviceHeader: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  if (deviceToken) headers.set(DEVICE_HEADER, deviceToken);
  const res = await fetch(input, { ...init, headers });
  if (forbiddenHandler && (await isDeviceNotApproved(res))) forbiddenHandler();
  return res;
};

/**
 * The only Supabase client in the app. The session lives in AsyncStorage (a JWT, no vault secret);
 * everything secret lives in SecureStore or memory.
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: { fetch: fetchWithDeviceHeader },
});
