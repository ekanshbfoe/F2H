/**
 * One time Admin bootstrap (spec 0001-data-model-rls, AC-10). Run on your machine, never in the app:
 *
 *   npm run bootstrap:admin -- <email> <authSecret>
 *   npm run bootstrap:admin -- <email> --password '<the admin password>'
 *
 * Reads SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL from .env) and SUPABASE_SERVICE_ROLE_KEY
 * (from supabase/.env). With `--password` the auth secret is derived here with the same split
 * the phone uses (scrypt N=2^7, HKDF "f2h:auth"), so the Admin can log in on the phone with
 * that password. Safe to rerun: existing rows are updated, never duplicated.
 */
import { createClient } from '@supabase/supabase-js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { scrypt } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64urlnopad } from '@scure/base';

const KDF = { N: 2 ** 7, r: 8, p: 1, dkLen: 32 } as const;

function loadEnv(path: string) {
  try {
    process.loadEnvFile(path);
  } catch {
    /* optional file */
  }
}
loadEnv('.env');
loadEnv('supabase/.env');

function fail(message: string): never {
  console.error(message);
  process.exit(1);
  throw new Error(message);
}

function deriveAuthSecret(email: string, password: string): string {
  const enc = new TextEncoder();
  const stretched = scrypt(enc.encode(password), enc.encode(`f2h:pw:v1:${email}`), KDF);
  return base64urlnopad.encode(
    hkdf(sha256, stretched, enc.encode('f2h:auth'), enc.encode('auth:v1'), 32),
  );
}

async function main() {
  const [rawEmail, secretOrFlag, maybePassword] = process.argv.slice(2);
  if (!rawEmail || !secretOrFlag)
    fail('usage: bootstrap-admin <email> <authSecret> | <email> --password <pw>');
  const email = rawEmail.trim().toLowerCase();
  const authSecret =
    secretOrFlag === '--password'
      ? deriveAuthSecret(email, maybePassword ?? fail('missing password after --password'))
      : secretOrFlag;
  if (!/^[A-Za-z0-9_-]{43}$/.test(authSecret)) fail('authSecret must be 43 chars of base64url');

  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    fail('SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Auth user: find by email, else create. Password is the auth half of the split.
  let userId: string | undefined;
  const { data: list, error: listError } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listError) fail(`listUsers: ${listError.message}`);
  const existing = list.users.find((u) => u.email?.toLowerCase() === email);
  if (existing) {
    userId = existing.id;
    const { error } = await db.auth.admin.updateUserById(userId, {
      password: authSecret,
      email_confirm: true,
    });
    if (error) fail(`updateUser: ${error.message}`);
    console.log(`auth user exists, password refreshed: ${userId}`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: authSecret,
      email_confirm: true,
    });
    if (error || !data.user) fail(`createUser: ${error?.message ?? 'no user returned'}`);
    userId = data.user.id;
    console.log(`auth user created: ${userId}`);
  }

  // 2. allowed_members (admin label), 3. profiles (admin, active), 4. family_config.admin_user_id.
  const steps: [string, PromiseLike<{ error: { message: string } | null }>][] = [
    [
      'allowed_members',
      db
        .from('allowed_members')
        .upsert({ email, label: 'admin', consumed_at: new Date().toISOString(), added_by: userId }),
    ],
    [
      'profiles',
      db.from('profiles').upsert({
        id: userId,
        email,
        display_name: 'Admin',
        role: 'admin',
        status: 'active',
        kdf_params: KDF,
        activated_at: new Date().toISOString(),
      }),
    ],
    [
      'family_config',
      db
        .from('family_config')
        .update({ admin_user_id: userId, updated_at: new Date().toISOString() })
        .eq('id', 1),
    ],
  ];
  for (const [name, promise] of steps) {
    const { error } = await promise;
    if (error) fail(`${name}: ${error.message}`);
    console.log(`${name}: ok`);
  }
  console.log(
    'Admin bootstrapped. Next: open the app on the Admin phone and log in; the first device is auto approved.',
  );
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
