import { bytesToUtf8, envelope, fromBase64, randomUuid, toBase64 } from '@/crypto';
import { supabase } from '@/services/supabase';
import type { Tables } from '@/types/database.types';

/**
 * Minimal vault item access used by the auth slice (the Admin's recovery key note). The contacts,
 * credentials and files features build their own models on the same envelope.
 */
export interface NotePayload {
  v: 1;
  type: 'note';
  tag?: string;
  title: string;
  body: string;
}

export type VaultItemRow = Tables<'vault_items'>;

export async function createNoteItem(
  mk: Uint8Array,
  ownerId: string,
  payload: NotePayload,
): Promise<string> {
  const id = randomUuid();
  const dek = envelope.generateDek();
  const ciphertext = toBase64(envelope.encryptItem(dek, JSON.stringify(payload), id));
  const dekWrapped = toBase64(envelope.wrapDek(mk, dek, id));
  dek.fill(0);
  const { error } = await supabase.from('vault_items').insert({
    id,
    owner_id: ownerId,
    kind: 'note',
    dek_wrapped: dekWrapped,
    ciphertext,
  });
  if (error) throw new Error(`vault insert failed: ${error.code ?? error.message}`);
  return id;
}

export function decryptNote(mk: Uint8Array, row: VaultItemRow): NotePayload {
  const dek = envelope.unwrapDek(mk, fromBase64(row.dek_wrapped), row.id);
  try {
    return JSON.parse(
      bytesToUtf8(envelope.decryptItem(dek, fromBase64(row.ciphertext), row.id)),
    ) as NotePayload;
  } finally {
    dek.fill(0);
  }
}

/** Finds the owner's note with a given tag; scans the few notes a member has. */
export async function findNoteByTag(
  mk: Uint8Array,
  tag: string,
  hintId?: string | null,
): Promise<{ id: string; note: NotePayload } | null> {
  if (hintId) {
    const { data } = await supabase.from('vault_items').select('*').eq('id', hintId).maybeSingle();
    if (data) {
      const note = decryptNote(mk, data);
      if (note.tag === tag) return { id: data.id, note };
    }
  }
  const { data } = await supabase
    .from('vault_items')
    .select('*')
    .eq('kind', 'note')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  for (const row of data ?? []) {
    try {
      const note = decryptNote(mk, row);
      if (note.tag === tag) return { id: row.id, note };
    } catch {
      /* not ours to read, skip */
    }
  }
  return null;
}
