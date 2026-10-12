import { create } from 'zustand';

import { useLock } from '@/features/lock/lock.store';
import { clearScratch } from '@/services/file-adapter';

import { deleteFile, listFiles, uploadFile, type PickedFile, type UploadProgress } from './api';
import type { BlobState, StoredFile } from './model';

/**
 * The decrypted file list and the one upload in flight, in memory only. A lock, sign out or wipe
 * empties it and deletes every cached ciphertext and decrypted copy (AC-9).
 */
interface FilesState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: Record<string, StoredFile>;
  states: Record<string, BlobState>;
  skipped: number;
  /** showing the read only offline copy (spec 0005, AC-7) */
  offline: boolean;
  error: string | null;
  upload: { name: string; progress: UploadProgress } | null;
  load: () => Promise<void>;
  add: (picked: PickedFile) => Promise<BlobState>;
  remove: (item: StoredFile) => Promise<void>;
  clear: () => void;
}

const EMPTY = {
  status: 'idle' as const,
  items: {},
  states: {},
  skipped: 0,
  offline: false,
  error: null,
  upload: null,
};

export const useFiles = create<FilesState>((set, get) => ({
  ...EMPTY,
  load: async () => {
    const generation = useLock.getState().generation;
    set({ status: get().status === 'ready' ? 'ready' : 'loading', error: null });
    try {
      const { items, states, skipped, offline } = await listFiles();
      if (useLock.getState().generation !== generation) return;
      set({
        status: 'ready',
        items: Object.fromEntries(items.map((f) => [f.id, f])),
        states,
        skipped,
        offline,
      });
    } catch (e) {
      if (useLock.getState().generation !== generation) return;
      set({ status: 'error', error: e instanceof Error ? e.message : 'Could not load files' });
    }
  },
  add: async (picked) => {
    set({ upload: { name: picked.name, progress: { phase: 'encrypting', a: null, b: null } } });
    try {
      const { item, state } = await uploadFile(picked, (progress) =>
        set({ upload: { name: picked.name, progress } }),
      );
      set((s) => ({
        items: { ...s.items, [item.id]: item },
        states: { ...s.states, [item.id]: state },
      }));
      return state;
    } finally {
      set({ upload: null });
    }
  },
  remove: async (item) => {
    await deleteFile(item.id);
    set((s) => {
      const items = { ...s.items };
      delete items[item.id];
      return { items };
    });
  },
  clear: () => set({ ...EMPTY }),
}));

useLock.subscribe((s, prev) => {
  if (s.generation === prev.generation) return;
  useFiles.getState().clear();
  clearScratch();
});
