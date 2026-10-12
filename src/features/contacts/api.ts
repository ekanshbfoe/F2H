import type { ItemRow } from '@/features/vault/items';
import {
  createItems,
  listItems,
  openItem,
  softDeleteItem,
  updateItem,
  VaultItemError,
} from '@/features/vault/items';

import { parsePayload, type ContactPayload, type StoredContact } from './model';

/**
 * Contacts on the shared vault items path (spec 0003): one `vault_items` row of kind `contact`
 * per contact. The envelope, the version retry and the soft delete live in `vault/items.ts`.
 */

export { VaultItemError as ContactsError, INSERT_BATCH } from '@/features/vault/items';

export function openRow(mk: Uint8Array, row: ItemRow): StoredContact | null {
  return openItem(mk, row, parsePayload);
}

export async function listContacts(): Promise<{
  items: StoredContact[];
  skipped: number;
  offline: boolean;
}> {
  return listItems('contact', parsePayload);
}

export async function createContact(payload: ContactPayload): Promise<StoredContact> {
  const [created] = await createContacts([payload]);
  if (!created) throw new VaultItemError('vault_insert_failed');
  return created;
}

/** Inserts in batches of 50 (import); `onProgress` gets the running total. */
export async function createContacts(
  payloads: ContactPayload[],
  onProgress?: (done: number) => void,
): Promise<StoredContact[]> {
  return createItems('contact', payloads, onProgress);
}

export async function updateContact(
  id: string,
  version: number,
  payload: ContactPayload,
): Promise<StoredContact> {
  return updateItem(id, version, payload);
}

/** Soft delete: the row stays for history, `deleted_at` hides it (AC-6). */
export async function deleteContact(id: string, version: number): Promise<void> {
  await softDeleteItem(id, version);
}
