import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { HttpError } from './errors.ts';

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, 'config_missing', `${name} is not set`);
  return value;
}

/** Service role client: bypasses RLS. Only for cross user work that also writes `audit_log`. */
export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client acting as the caller: forwards the JWT and the device header so RLS applies as in the app. */
export function userClient(req: Request): SupabaseClient {
  const authorization = req.headers.get('Authorization') ?? '';
  const device = req.headers.get('x-f2h-device');
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: authorization, ...(device ? { 'x-f2h-device': device } : {}) },
    },
  });
}
