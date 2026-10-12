import { bytesToUtf8, envelope, fromBase64, randomUuid, toBase64, zero } from '@/crypto';
import { withKey } from '@/features/lock/api';
import { supabase } from '@/services/supabase';
import { useSession } from '@/state/session.store';

import { parsePayload, type ContactPayload, type StoredContact } from './model';

/**
 * Contacts on the vault envelope (spec 0003): one `vault_items` row of kind `contact` per
 * contact, a fresh data key on every write, the item id as AAD. Every call runs on a copy of the
 * master key through `withKey`, and checks `assertLive` right before it writes (AC-8).
 */

export class ContactsError extends Error {
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
    this.name = 'ContactsError';
  }
}

interface Row {
  id: string;
  version: number;
  dek_wrapped: string;
  ciphertext: string;
}

const COLUMNS = 'id, version, dek_wrapped, ciphertext';
export const INSERT_BATCH = 50;

function seal(mk: Uint8Array, id: string, payload: ContactPayload) {
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

/** Decrypts one row; null when it is not ours to read or not a v1 contact. */
export function openRow(mk: Uint8Array, row: Row): StoredContact | null {
  let dek: Uint8Array | null = null;
  try {
    dek = envelope.unwrapDek(mk, fromBase64(row.dek_wrapped), row.id);
    const json = bytesToUtf8(envelope.decryptItem(dek, fromBase64(row.ciphertext), row.id));
    const payload = parsePayload(JSON.parse(json));
    return payload ? { id: row.id, version: row.version, payload } : null;
  } catch {
    return null;
  } finally {
    if (dek) zero(dek);
  }
}

function ownerId(): string {
  const id = useSession.getState().profile?.id;
  if (!id) throw new ContactsError('no_profile');
  return id;
}

/** Every live contact of the signed in member, decrypted; rows that fail are counted. */
export async function listContacts(): Promise<{ items: StoredContact[]; skipped: number }> {
  return withKey(async (mk) => {
    const { data, error } = await supabase
      .from('vault_items')
      .select(COLUMNS)
      .eq('kind', 'contact')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw new ContactsError('vault_read_failed', error.message);
    const items: StoredContact[] = [];
    let skipped = 0;
    for (const row of (data ?? []) as Row[]) {
      const c = openRow(mk, row);
      if (c) items.push(c);
      else skipped += 1;
    }
    return { items, skipped };
  });
}

export async function createContact(payload: ContactPayload): Promise<StoredContact> {
  const [created] = await createContacts([payload]);
  if (!created) throw new ContactsError('vault_insert_failed');
  return created;
}

/** Inserts in batches of 50 (import); `onProgress` gets the running total. */
export async function createContacts(
  payloads: ContactPayload[],
  onProgress?: (done: number) => void,
): Promise<StoredContact[]> {
  const owner = ownerId();
  return withKey(async (mk, assertLive) => {
    const out: StoredContact[] = [];
    for (let i = 0; i < payloads.length; i += INSERT_BATCH) {
      const batch = payloads.slice(i, i + INSERT_BATCH).map((payload) => {
        const id = randomUuid();
        return {
          id,
          payload,
          row: { id, owner_id: owner, kind: 'contact' as const, ...seal(mk, id, payload) },
        };
      });
      assertLive();
      const { error } = await supabase.from('vault_items').insert(batch.map((b) => b.row));
      if (error) throw new ContactsError('vault_insert_failed', error.message, out.length);
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
  if (error) throw new ContactsError('vault_read_failed', error.message);
  if (!data) throw new ContactsError('not_found');
  return data.version;
}

/**
 * Writes `patch` with the version the phone holds; when another phone wrote first (the guard
 * answers `stale_version`) it re-reads the version and tries once more, then gives up (AC-6).
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
      if (!error && !data) throw new ContactsError('not_found');
      if (!isStale(error) || attempt === 1) {
        throw isStale(error)
          ? new ContactsError('stale_version')
          : new ContactsError('vault_update_failed', error?.message);
      }
      v = await currentVersion(id);
    }
    throw new ContactsError('stale_version');
  });
}

export async function updateContact(
  id: string,
  version: number,
  payload: ContactPayload,
): Promise<StoredContact> {
  const next = await guardedUpdate(id, version, (mk) => seal(mk, id, payload));
  return { id, version: next, payload };
}

/** Soft delete: the row stays for history, `deleted_at` hides it (AC-6). */
export async function deleteContact(id: string, version: number): Promise<void> {
  await guardedUpdate(id, version, () => ({ deleted_at: new Date().toISOString() }));
}
