/**
 * The nightly snapshot's contents (spec 0006, AC-1, AC-4). Columns that would be useless or
 * risky after a restore are stripped: device token hashes and registration nonces (every phone
 * registers again) and Vault secret ids (both Drives are linked again).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { HttpError } from './errors.ts';

export const SCHEMA = 1;
export const KEEP_DAYS = 30;
const PAGE = 1000;

/** Tables in restore order (parents before children). */
export const TABLES = [
  'family_config',
  'profiles',
  'allowed_members',
  'devices',
  'key_material',
  'vault_items',
  'file_blobs',
  'drive_accounts',
  'recovery_grants',
  'audit_log',
  'backups',
] as const;
export type TableName = (typeof TABLES)[number];

export const STRIP: Partial<Record<TableName, string[]>> = {
  devices: ['token_hash', 'registration_nonce'],
  drive_accounts: ['vault_secret_id'],
};

export function stripRow(table: TableName, row: Record<string, unknown>): Record<string, unknown> {
  const drop = STRIP[table];
  if (!drop) return row;
  const out = { ...row };
  for (const c of drop) delete out[c];
  return out;
}

export interface Snapshot {
  schema: number;
  taken_at: string;
  /** auth.users and auth.identities rows a restored project needs for the existing passwords */
  auth: { users: Record<string, unknown>[]; identities: Record<string, unknown>[] };
  tables: Record<TableName, Record<string, unknown>[]>;
}

/** Reads every table in pages of 1000 (PostgREST's cap) with the service role. */
export async function dumpTables(db: SupabaseClient, takenAt: Date): Promise<Snapshot> {
  const tables = {} as Record<TableName, Record<string, unknown>[]>;
  for (const table of TABLES) {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from(table)
        .select('*')
        .range(from, from + PAGE - 1);
      if (error) throw new HttpError(500, 'dump_failed', `${table}: ${error.message}`);
      for (const r of data ?? []) rows.push(stripRow(table, r as Record<string, unknown>));
      if (!data || data.length < PAGE) break;
    }
    tables[table] = rows;
  }
  const { data: auth, error } = await db.rpc('backup_auth_rows');
  if (error || !auth) throw new HttpError(500, 'dump_failed', `auth: ${error?.message ?? 'empty'}`);
  return {
    schema: SCHEMA,
    taken_at: takenAt.toISOString(),
    auth: auth as Snapshot['auth'],
    tables,
  };
}

export function fileNameFor(takenAt: Date): string {
  return `f2h-backup-${takenAt.toISOString().slice(0, 10)}.bin`;
}

/** Rows older than the keep window, plus any earlier row of the same day (it is replaced). */
export function rowsToPrune(
  rows: { id: string; taken_at: string }[],
  now: Date,
  keepDays = KEEP_DAYS,
): string[] {
  const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000;
  const today = now.toISOString().slice(0, 10);
  return rows
    .filter((r) => new Date(r.taken_at).getTime() < cutoff || r.taken_at.slice(0, 10) === today)
    .map((r) => r.id);
}
