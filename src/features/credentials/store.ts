import { create } from 'zustand';

import { useLock } from '@/features/lock/lock.store';
import {
  createItems,
  listItems,
  softDeleteItem,
  updateItem,
  VaultItemError,
} from '@/features/vault/items';
import { clearSecretClipboard } from '@/services/clipboard';

import { parsePayload, type CredentialPayload, type StoredCredential } from './model';

/**
 * The decrypted credentials, in memory only (spec 0004, AC-8). The lock generation moving (lock,
 * sign out, wipe) empties the store and clears a copied secret from the clipboard at once.
 */
interface CredentialsState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: Record<string, StoredCredential>;
  skipped: number;
  /** showing the read only offline copy (spec 0005, AC-7) */
  offline: boolean;
  error: string | null;
  load: () => Promise<void>;
  save: (payload: CredentialPayload, existing?: StoredCredential) => Promise<StoredCredential>;
  remove: (c: StoredCredential) => Promise<void>;
  clear: () => void;
}

const EMPTY = { status: 'idle' as const, items: {}, skipped: 0, offline: false, error: null };

export const useCredentials = create<CredentialsState>((set, get) => ({
  ...EMPTY,
  load: async () => {
    const generation = useLock.getState().generation;
    set({ status: get().status === 'ready' ? 'ready' : 'loading', error: null });
    try {
      const { items, skipped, offline } = await listItems('credential', parsePayload);
      if (useLock.getState().generation !== generation) return;
      set({
        status: 'ready',
        items: Object.fromEntries(items.map((c) => [c.id, c])),
        skipped,
        offline,
      });
    } catch (e) {
      if (useLock.getState().generation !== generation) return;
      set({
        status: 'error',
        error: e instanceof Error ? e.message : 'Could not load credentials',
      });
    }
  },
  save: async (payload, existing) => {
    let saved: StoredCredential;
    if (existing) {
      saved = await updateItem(existing.id, existing.version, payload);
    } else {
      const [created] = await createItems('credential', [payload]);
      if (!created) throw new VaultItemError('vault_insert_failed');
      saved = created;
    }
    set((s) => ({ items: { ...s.items, [saved.id]: saved } }));
    return saved;
  },
  remove: async (c) => {
    await softDeleteItem(c.id, c.version);
    set((s) => {
      const items = { ...s.items };
      delete items[c.id];
      return { items };
    });
  },
  clear: () => set({ ...EMPTY }),
}));

useLock.subscribe((s, prev) => {
  if (s.generation === prev.generation) return;
  useCredentials.getState().clear();
  void clearSecretClipboard();
});
