import { Directory, File, Paths } from 'expo-file-system';

import type { FileAdapter } from '@/crypto';

/**
 * The `FileAdapter` the chunked format needs, on the SDK 57 `expo-file-system` File API (spec
 * child 0001-drive-redundancy, AC-4, AC-9). Reads and appends go through a FileHandle at an
 * offset, so only one chunk is ever held in memory.
 */
export const expoFileAdapter: FileAdapter = {
  async size(uri) {
    return new File(uri).size ?? 0;
  },
  async read(uri, position, length) {
    const handle = new File(uri).open();
    try {
      handle.offset = position;
      return handle.readBytes(length);
    } finally {
      handle.close();
    }
  },
  async create(uri) {
    const f = new File(uri);
    if (f.exists) f.delete();
    f.create({ intermediates: true });
  },
  async append(uri, bytes) {
    const f = new File(uri);
    const handle = f.open();
    try {
      handle.offset = handle.size ?? f.size ?? 0;
      handle.writeBytes(bytes);
    } finally {
      handle.close();
    }
  },
};

/** Scratch directories under the cache; every one is emptied on lock (AC-9). */
export const FILE_DIRS = ['f2h-upload', 'f2h-download', 'f2h-open'] as const;
export type FileDir = (typeof FILE_DIRS)[number];

export function scratchUri(dir: FileDir, name: string): string {
  const d = new Directory(Paths.cache, dir);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return new File(d, name).uri;
}

/**
 * Copies a picked file into this app's own scratch folder. The picker hands back a content URI
 * the app may read; a copy the picker made itself lands in a cache folder that Expo Go does not
 * let the app open. The copy is plaintext: callers remove it as soon as it is encrypted, and the
 * scratch folders are emptied on every lock.
 */
export async function stageCopy(sourceUri: string, destinationUri: string): Promise<void> {
  const destination = new File(destinationUri);
  if (destination.exists) destination.delete();
  await new File(sourceUri).copy(destination);
}

export function removeFile(uri: string): void {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}

/** Deletes every decrypted or temporary file this app wrote to the cache. */
export function clearScratch(): void {
  for (const dir of FILE_DIRS) {
    try {
      const d = new Directory(Paths.cache, dir);
      if (d.exists) d.delete();
    } catch {
      // nothing to clear
    }
  }
}
