import { create } from 'zustand';

import { useLock } from '@/features/lock/lock.store';
import { clearScratch, fileExists, removeFile } from '@/services/file-adapter';

import {
  deleteFile,
  downloadFile,
  listFiles,
  uploadFile,
  type PickedFile,
  type UploadProgress,
} from './api';
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
  /** Decrypted copies opened since the last lock, by item id (the files live in the scratch folder). */
  opened: Record<string, string>;
  load: () => Promise<void>;
  add: (picked: PickedFile) => Promise<BlobState>;
  remove: (item: StoredFile) => Promise<void>;
  /** The decrypted copy of a file: the one opened earlier this session, or a fresh download. */
  openCopy: (item: StoredFile) => Promise<string>;
  /** Deletes each file in turn; the ones that failed stay in the list and come back as ids. */
  removeMany: (items: StoredFile[]) => Promise<{ deleted: number; failed: string[] }>;
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
  opened: {},
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
      const opened = { ...s.opened };
      delete opened[item.id];
      return { items, opened };
    });
  },
  openCopy: async (item) => {
    const known = get().opened[item.id];
    if (known && fileExists(known)) return known;
    const generation = useLock.getState().generation;
    const uri = await downloadFile(item);
    if (useLock.getState().generation !== generation) {
      removeFile(uri);
      throw new Error('locked');
    }
    set((s) => ({
      // two files with the same name share a path; the older entry no longer holds its file
      opened: {
        ...Object.fromEntries(Object.entries(s.opened).filter(([, u]) => u !== uri)),
        [item.id]: uri,
      },
    }));
    return uri;
  },
  removeMany: async (list) => {
    const failed: string[] = [];
    let deleted = 0;
    // one at a time: a cheap phone stays responsive and the Drive API is not flooded
    for (const item of list) {
      try {
        await get().remove(item);
        deleted += 1;
      } catch {
        failed.push(item.id);
      }
    }
    return { deleted, failed };
  },
  clear: () => set({ ...EMPTY }),
}));

useLock.subscribe((s, prev) => {
  if (s.generation === prev.generation) return;
  useFiles.getState().clear();
  clearScratch();
});
