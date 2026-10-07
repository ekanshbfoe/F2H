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

/** Adds the device header when a token exists. Realtime uses the JWT only; it never sees this header. */
export const fetchWithDeviceHeader: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (deviceToken) headers.set(DEVICE_HEADER, deviceToken);
  return fetch(input, { ...init, headers });
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
