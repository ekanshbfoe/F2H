/// <reference types="node" />
/**
 * Restore an F2H snapshot (spec 0006, AC-6). Run on your own machine, never in the app:
 *
 *   npm run restore:backup -- <f2h-backup-YYYY-MM-DD.bin> [--out restore.sql]
 *
 * It asks for the 24 words of the paper kit, rebuilds the recovery key, refuses a key whose
 * fingerprint differs from the one inside the snapshot, opens the sealed file and writes plain
 * SQL for a fresh Supabase project that already ran `npm run db:push`. It never connects to a
 * database itself; follow docs/runbooks/restore.md.
 *
 * Self contained (it imports @noble and @scure directly) because Node's type stripping cannot
 * follow the app's extensionless imports.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const enc = new TextEncoder();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** Words → recovery keypair, exactly as `src/crypto/recovery.ts` does it. */
export function recoveryFromWords(words: string): { secretKey: Uint8Array; publicKey: Uint8Array } {
  const phrase = words.trim().toLowerCase().split(/\s+/).join(' ');
  if (phrase.split(' ').length !== 24 || !validateMnemonic(phrase, wordlist)) {
    throw new Error('These are not 24 valid kit words (checksum failed).');
  }
  const seed = mnemonicToEntropy(phrase, wordlist);
  const secretKey = hkdf(
    sha256,
    seed,
    enc.encode('f2h:recovery'),
    enc.encode('f2h:recovery-x25519:v1'),
    32,
  );
  seed.fill(0);
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) };
}

export function fingerprint(publicKey: Uint8Array): string {
  const h = hex(sha256(publicKey).subarray(0, 8));
  return [h.slice(0, 4), h.slice(4, 8), h.slice(8, 12), h.slice(12, 16)].join(' ');
}

/** The umbrella sealed box, opened (same construction as `src/crypto/box.ts`). */
export function openSealed(secretKey: Uint8Array, wire: Uint8Array): Uint8Array {
  if (wire.length < 1 + 32 + 24 + 16 || wire[0] !== 0x01)
    throw new Error('Not an F2H sealed file.');
  const ephPub = wire.subarray(1, 33);
  const nonce = wire.subarray(33, 57);
  const recipientPub = x25519.getPublicKey(secretKey);
  const salt = new Uint8Array(64);
  salt.set(ephPub, 0);
  salt.set(recipientPub, 32);
  const key = hkdf(
    sha256,
    x25519.getSharedSecret(secretKey, ephPub),
    salt,
    enc.encode('f2h:sealed-box:v1'),
    32,
  );
  try {
    return xchacha20poly1305(key, nonce, salt).decrypt(wire.subarray(57));
  } catch {
    throw new Error('The file does not open with this kit (wrong words, or the file is damaged).');
  } finally {
    key.fill(0);
  }
}

type Row = Record<string, unknown>;
export interface Snapshot {
  schema: number;
  taken_at: string;
  auth: { users: Row[]; identities: Row[] };
  tables: Record<string, Row[]>;
}

/** A SQL literal for one value. bytea arrives from PostgREST as `\x…` text, which Postgres accepts. */
export function literal(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function insert(table: string, row: Row, extra: Row = {}): string {
  const all = { ...row, ...extra };
  const cols = Object.keys(all);
  return `insert into ${table} (${cols.map((c) => `"${c}"`).join(', ')}) values (${cols.map((c) => literal(all[c])).join(', ')});`;
}

/**
 * Plain SQL for a fresh project after `db:push`: triggers off while loading (no webhook pushes, no
 * audit triggers firing again), auth rows first, then the tables in dependency order. Every old
 * phone comes back `revoked` with a placeholder token (each phone registers again); Drive accounts
 * are not restored (link both Drives again, their refresh tokens were never in the snapshot).
 */
export function buildRestoreSql(s: Snapshot): string {
  if (s.schema !== 1) throw new Error(`Unknown snapshot schema ${s.schema}.`);
  const out: string[] = [
    `-- F2H restore of the snapshot taken ${s.taken_at}`,
    'begin;',
    "set local session_replication_role = 'replica';",
  ];
  for (const u of s.auth.users) {
    out.push(
      insert('auth.users', u, {
        instance_id: '00000000-0000-0000-0000-000000000000',
        aud: 'authenticated',
        role: 'authenticated',
        updated_at: s.taken_at,
      }),
    );
  }
  for (const i of s.auth.identities)
    out.push(insert('auth.identities', i, { updated_at: s.taken_at }));

  const fc = s.tables.family_config?.[0];
  if (fc) {
    const cols = Object.keys(fc).filter((c) => c !== 'id');
    out.push(
      `${insert('public.family_config', fc).slice(0, -1)} on conflict (id) do update set ${cols.map((c) => `"${c}" = excluded."${c}"`).join(', ')};`,
    );
  }
  for (const table of ['profiles', 'allowed_members']) {
    for (const r of s.tables[table] ?? []) out.push(insert(`public.${table}`, r));
  }
  for (const d of s.tables.devices ?? []) {
    out.push(
      insert('public.devices', d, {
        status: 'revoked',
        token_hash: `restored-${String(d.id)}`,
        registration_nonce: `restored-${String(d.id)}`,
        push_token: null,
      }),
    );
  }
  for (const table of [
    'key_material',
    'vault_items',
    'file_blobs',
    'recovery_grants',
    'audit_log',
    'backups',
  ]) {
    for (const r of s.tables[table] ?? []) out.push(insert(`public.${table}`, r));
  }
  out.push(
    "select setval('public.audit_log_id_seq', greatest((select max(id) from public.audit_log), 1));",
  );
  out.push('commit;');
  return `${out.join('\n')}\n`;
}

export function summary(s: Snapshot): string {
  const lines = [`snapshot taken ${s.taken_at}`, `auth users: ${s.auth.users.length}`];
  for (const [t, rows] of Object.entries(s.tables)) lines.push(`${t}: ${rows.length}`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const outIdx = args.indexOf('--out');
  const outFile = outIdx >= 0 ? (args[outIdx + 1] ?? 'restore.sql') : 'restore.sql';
  if (!file) {
    console.error(
      'usage: npm run restore:backup -- <f2h-backup-YYYY-MM-DD.bin> [--out restore.sql]',
    );
    process.exit(1);
  }
  const wire = new Uint8Array(readFileSync(file));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const words = await rl.question('Type the 24 words of the paper kit, separated by spaces:\n> ');
  rl.close();
  const kit = recoveryFromWords(words);
  try {
    const snapshot = JSON.parse(
      new TextDecoder().decode(openSealed(kit.secretKey, wire)),
    ) as Snapshot;
    const expected = String(snapshot.tables.family_config?.[0]?.recovery_fingerprint ?? '');
    const got = fingerprint(kit.publicKey);
    if (expected && expected !== got) {
      throw new Error(`This kit has fingerprint ${got}, the snapshot belongs to ${expected}.`);
    }
    writeFileSync(outFile, buildRestoreSql(snapshot), { mode: 0o600 });
    console.log(
      `${summary(snapshot)}\nfingerprint ${got} matches\nwrote ${outFile} (contains wrapped keys only, still treat it as sensitive)`,
    );
  } finally {
    kit.secretKey.fill(0);
  }
}

if (process.argv[1]?.endsWith('restore-backup.ts')) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
