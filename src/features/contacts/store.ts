import { create } from 'zustand';

import { useLock } from '@/features/lock/lock.store';

import { createContact, createContacts, deleteContact, listContacts, updateContact } from './api';
import type { ContactPayload, StoredContact } from './model';

/**
 * The decrypted address book, in memory only (spec 0003, AC-8). It empties itself whenever the
 * lock generation moves (lock, sign out, wipe) and drops a load that finished after such a move.
 */
interface ContactsState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: Record<string, StoredContact>;
  skipped: number;
  /** showing the read only offline copy (spec 0005, AC-7) */
  offline: boolean;
  error: string | null;
  load: () => Promise<void>;
  save: (payload: ContactPayload, existing?: StoredContact) => Promise<StoredContact>;
  saveMany: (payloads: ContactPayload[], onProgress?: (n: number) => void) => Promise<number>;
  remove: (c: StoredContact) => Promise<void>;
  /** Deletes each contact in turn; the ones that failed stay in the list and come back as ids. */
  removeMany: (list: StoredContact[]) => Promise<{ deleted: number; failed: string[] }>;
  clear: () => void;
}

const EMPTY = { status: 'idle' as const, items: {}, skipped: 0, offline: false, error: null };

export const useContacts = create<ContactsState>((set, get) => ({
  ...EMPTY,
  load: async () => {
    const generation = useLock.getState().generation;
    set({ status: get().status === 'ready' ? 'ready' : 'loading', error: null });
    try {
      const { items, skipped, offline } = await listContacts();
      if (useLock.getState().generation !== generation) return;
      set({
        status: 'ready',
        items: Object.fromEntries(items.map((c) => [c.id, c])),
        skipped,
        offline,
        error: null,
      });
    } catch (e) {
      if (useLock.getState().generation !== generation) return;
      set({ status: 'error', error: e instanceof Error ? e.message : 'Could not load contacts' });
    }
  },
  save: async (payload, existing) => {
    const saved = existing
      ? await updateContact(existing.id, existing.version, payload)
      : await createContact(payload);
    set((s) => ({ items: { ...s.items, [saved.id]: saved } }));
    return saved;
  },
  saveMany: async (payloads, onProgress) => {
    const saved = await createContacts(payloads, onProgress);
    set((s) => ({
      items: { ...s.items, ...Object.fromEntries(saved.map((c) => [c.id, c])) },
    }));
    return saved.length;
  },
  remove: async (c) => {
    await deleteContact(c.id, c.version);
    set((s) => {
      const items = { ...s.items };
      delete items[c.id];
      return { items };
    });
  },
  removeMany: async (list) => {
    const failed: string[] = [];
    let deleted = 0;
    // one at a time: a cheap phone stays responsive and a failure costs one contact, not all
    for (const c of list) {
      try {
        await get().remove(c);
        deleted += 1;
      } catch {
        failed.push(c.id);
      }
    }
    return { deleted, failed };
  },
  clear: () => set({ ...EMPTY }),
}));

useLock.subscribe((s, prev) => {
  if (s.generation !== prev.generation) useContacts.getState().clear();
});
