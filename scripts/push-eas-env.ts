/// <reference types="node" />
/**
 * Copies the three public app values from your local `.env` into the EAS `preview` and
 * `production` environments, so a cloud build gets them (EAS never sees a git ignored `.env`).
 *
 *   npx eas-cli login          # once
 *   npm run eas:env            # then, and again whenever .env changes
 *
 * Only `EXPO_PUBLIC_*` values go up. They are public by design (the anon key is guarded by row
 * level security); no service role key, database password or Google secret is ever sent.
 */
import { execFileSync } from 'node:child_process';

const NAMES = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_EAS_PROJECT_ID',
] as const;
const ENVIRONMENTS = ['preview', 'production'] as const;

try {
  process.loadEnvFile('.env');
} catch {
  console.error('No .env found. Copy .env.example to .env and fill it in first.');
  process.exit(1);
}

const missing = NAMES.filter((n) => n !== 'EXPO_PUBLIC_EAS_PROJECT_ID' && !process.env[n]);
if (missing.length > 0) {
  console.error(`Missing in .env: ${missing.join(', ')}`);
  process.exit(1);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
for (const environment of ENVIRONMENTS) {
  for (const name of NAMES) {
    const value = process.env[name];
    if (!value) continue;
    execFileSync(
      npx,
      [
        'eas-cli',
        'env:set',
        '--name',
        name,
        '--value',
        value,
        '--environment',
        environment,
        '--visibility',
        'plaintext',
        '--non-interactive',
      ],
      { stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' },
    );
    console.log(`set ${name} for ${environment}`);
  }
}
