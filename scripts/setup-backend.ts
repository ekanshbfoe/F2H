/// <reference types="node" />
/**
 * One command backend setup for a fresh Supabase project (SETUP.md, step 3). Safe to rerun.
 *
 *   npx supabase login        # once
 *   npm run setup:backend
 *
 * Reads the project URL from `.env` and the server secrets from `supabase/.env`, then:
 * links the project, applies the migrations, stores the two Vault secrets the cron jobs and the
 * approval webhook read, sets the Edge Function secrets and deploys every function.
 * Secret values travel through temporary files that are deleted right after, never through the
 * command line, and are never printed.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fail(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

function loadEnv(path: string) {
  try {
    process.loadEnvFile(path);
  } catch {
    fail(`No ${path} found. Copy ${path}.example to ${path} and fill it in first.`);
  }
}
loadEnv('.env');
loadEnv('supabase/.env');

function need(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) fail(`Missing ${name}. See SETUP.md for where to find it.`);
  return value;
}

const url = need('EXPO_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co$/.exec(url)?.[1];
if (!ref) fail('EXPO_PUBLIC_SUPABASE_URL should look like https://<project-ref>.supabase.co');
need('SUPABASE_DB_PASSWORD');
const serviceRoleKey = need('SUPABASE_SERVICE_ROLE_KEY');
const googleClientId = need('GOOGLE_CLIENT_ID');
const googleClientSecret = need('GOOGLE_CLIENT_SECRET');

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
function supabase(args: string[], capture = false): string {
  const out = execFileSync(npx, ['supabase', ...args], {
    stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  return capture ? out : '';
}

const scratch = mkdtempSync(join(tmpdir(), 'f2h-setup-'));
function withTempFile(name: string, content: string, run: (path: string) => void) {
  const path = join(scratch, name);
  writeFileSync(path, content, { mode: 0o600 });
  try {
    run(path);
  } finally {
    rmSync(path, { force: true });
  }
}

const sqlText = (value: string) => `'${value.replace(/'/g, "''")}'`;
const upsertSecret = (name: string, value: string) => `
  select id into v from vault.secrets where name = ${sqlText(name)};
  if v is null then perform vault.create_secret(${sqlText(value)}, ${sqlText(name)});
  else perform vault.update_secret(v, ${sqlText(value)}); end if;`;

try {
  console.log(`1/5 Linking project ${ref}`);
  supabase(['link', '--project-ref', ref]);

  console.log('\n2/5 Applying database migrations');
  supabase(['db', 'push', '--yes']);

  console.log('\n3/5 Storing the Vault secrets for the cron jobs and the approval webhook');
  withTempFile(
    'vault.sql',
    `do $$ declare v uuid; begin${upsertSecret('project_url', url)}${upsertSecret(
      'service_role_key',
      serviceRoleKey,
    )}\nend $$;\n`,
    (path) => supabase(['db', 'query', '--linked', '-f', path], true),
  );
  console.log('project_url and service_role_key stored');

  console.log('\n4/5 Setting the Edge Function secrets');
  const existing = supabase(['secrets', 'list'], true);
  const lines = [
    `GOOGLE_CLIENT_ID=${googleClientId}`,
    `GOOGLE_CLIENT_SECRET=${googleClientSecret}`,
  ];
  if (!/\bDRIVE_STATE_SECRET\b/.test(existing)) {
    lines.push(`DRIVE_STATE_SECRET=${randomBytes(32).toString('base64url')}`);
  }
  withTempFile('functions.env', `${lines.join('\n')}\n`, (path) =>
    supabase(['secrets', 'set', '--env-file', path], true),
  );
  console.log(lines.map((l) => l.split('=')[0]).join(', '), 'set');

  console.log('\n5/5 Deploying the Edge Functions');
  supabase(['functions', 'deploy', '--use-api']);
} catch (error) {
  fail(
    `Setup stopped: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}\n` +
      'If it says you are not logged in, run `npx supabase login` and try again.',
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`
Backend ready. Left to do by hand (SETUP.md, step 4 onwards):
- Supabase dashboard -> Authentication -> Sign In / Providers: turn off "Allow new users to sign up"
  and "Confirm email".
- Google Cloud OAuth client redirect URI: ${url}/functions/v1/drive-link-callback
- Create the Admin: npm run bootstrap:admin -- <email> --password '<password>'`);
