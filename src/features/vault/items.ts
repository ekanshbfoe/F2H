import { bytesToUtf8, envelope, fromBase64, randomUuid, toBase64, zero } from '@/crypto';
import { withKey } from '@/features/lock/api';
import { supabase } from '@/services/supabase';
import { useSession } from '@/state/session.store';
import type { Database } from '@/types/database.types';

/**
 * Typed vault items on the envelope (specs 0003 and 0004): one `vault_items` row per item, a
 * fresh data key on every write, the item id as AAD. Every call runs on a copy of the master key
 * through `withKey` and checks `assertLive` right before it writes, so a lock in the middle never
 * writes under a stale key. Contacts, credentials and later kinds all share this one path.
 */

export type ItemKind = Database['public']['Enums']['item_kind'];

export class VaultItemError extends Error {
  constructor(
    readonly code:
      | 'vault_read_failed'
      | 'vault_insert_failed'
      | 'vault_update_failed'
      | 'stale_version'
      | 'not_found'
      | 'no_profile',
    message?: string,
    readonly landed = 0,
  ) {
    super(message ?? code);
    this.name = 'VaultItemError';
  }
}

export interface StoredItem<T> {
  id: string;
  version: number;
  payload: T;
}

export interface ItemRow {
  id: string;
  version: number;
  dek_wrapped: string;
  ciphertext: string;
}

const COLUMNS = 'id, version, dek_wrapped, ciphertext';
export const INSERT_BATCH = 50;

export function sealItem(mk: Uint8Array, id: string, payload: unknown) {
  const dek = envelope.generateDek();
  try {
    return {
      dek_wrapped: toBase64(envelope.wrapDek(mk, dek, id)),
      ciphertext: toBase64(envelope.encryptItem(dek, JSON.stringify(payload), id)),
    };
  } finally {
    zero(dek);
  }
}

/** Decrypts one row; null when it is not ours to read or `parse` refuses the payload. */
export function openItem<T>(
  mk: Uint8Array,
  row: ItemRow,
  parse: (raw: unknown) => T | null,
): StoredItem<T> | null {
  let dek: Uint8Array | null = null;
  try {
    dek = envelope.unwrapDek(mk, fromBase64(row.dek_wrapped), row.id);
    const json = bytesToUtf8(envelope.decryptItem(dek, fromBase64(row.ciphertext), row.id));
    const payload = parse(JSON.parse(json));
    return payload ? { id: row.id, version: row.version, payload } : null;
  } catch {
    return null;
  } finally {
    if (dek) zero(dek);
  }
}

function ownerId(): string {
  const id = useSession.getState().profile?.id;
  if (!id) throw new VaultItemError('no_profile');
  return id;
}

/** Every live item of one kind, decrypted; rows that fail to open are counted, not thrown. */
export async function listItems<T>(
  kind: ItemKind,
  parse: (raw: unknown) => T | null,
): Promise<{ items: StoredItem<T>[]; skipped: number }> {
  return withKey(async (mk) => {
    const { data, error } = await supabase
      .from('vault_items')
      .select(COLUMNS)
      .eq('kind', kind)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw new VaultItemError('vault_read_failed', error.message);
    const items: StoredItem<T>[] = [];
    let skipped = 0;
    for (const row of (data ?? []) as ItemRow[]) {
      const item = openItem(mk, row, parse);
      if (item) items.push(item);
      else skipped += 1;
    }
    return { items, skipped };
  });
}

/** Inserts in batches of 50; `onProgress` gets the running total; `landed` on error says how many made it. */
export async function createItems<T>(
  kind: ItemKind,
  payloads: T[],
  onProgress?: (done: number) => void,
): Promise<StoredItem<T>[]> {
  const owner = ownerId();
  return withKey(async (mk, assertLive) => {
    const out: StoredItem<T>[] = [];
    for (let i = 0; i < payloads.length; i += INSERT_BATCH) {
      const batch = payloads.slice(i, i + INSERT_BATCH).map((payload) => {
        const id = randomUuid();
        return { id, payload, row: { id, owner_id: owner, kind, ...sealItem(mk, id, payload) } };
      });
      assertLive();
      const { error } = await supabase.from('vault_items').insert(batch.map((b) => b.row));
      if (error) throw new VaultItemError('vault_insert_failed', error.message, out.length);
      for (const b of batch) out.push({ id: b.id, version: 1, payload: b.payload });
      onProgress?.(out.length);
    }
    return out;
  });
}

function isStale(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === 'P0001' || /stale_version/.test(error.message ?? '')));
}

async function currentVersion(id: string): Promise<number> {
  const { data, error } = await supabase
    .from('vault_items')
    .select('version')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new VaultItemError('vault_read_failed', error.message);
  if (!data) throw new VaultItemError('not_found');
  return data.version;
}

/**
 * Writes with the version the phone holds; when another phone wrote first (the guard answers
 * `stale_version`) it re-reads the version and tries once more, then gives up.
 */
async function guardedUpdate(
  id: string,
  version: number,
  build: (mk: Uint8Array) => Record<string, unknown>,
): Promise<number> {
  return withKey(async (mk, assertLive) => {
    let v = version;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const patch = { ...build(mk), version: v };
      assertLive();
      const { data, error } = await supabase
        .from('vault_items')
        .update(patch)
        .eq('id', id)
        .select('version')
        .maybeSingle();
      if (!error && data) return data.version;
      if (!error && !data) throw new VaultItemError('not_found');
      if (!isStale(error) || attempt === 1) {
        throw isStale(error)
          ? new VaultItemError('stale_version')
          : new VaultItemError('vault_update_failed', error?.message);
      }
      v = await currentVersion(id);
    }
    throw new VaultItemError('stale_version');
  });
}

export async function updateItem<T>(
  id: string,
  version: number,
  payload: T,
): Promise<StoredItem<T>> {
  const next = await guardedUpdate(id, version, (mk) => sealItem(mk, id, payload));
  return { id, version: next, payload };
}

/** Soft delete: the row stays for history, `deleted_at` hides it. */
export async function softDeleteItem(id: string, version: number): Promise<void> {
  await guardedUpdate(id, version, () => ({ deleted_at: new Date().toISOString() }));
}
