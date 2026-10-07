import type { FileAdapter } from '../chunked';
import { concat } from '../encoding';

export interface MemoryFs extends FileAdapter {
  files: Map<string, Uint8Array>;
  get(uri: string): Uint8Array;
  set(uri: string, bytes: Uint8Array): void;
}

/** In memory `FileAdapter` for tests and the dev bench. Not used by production code paths. */
export function createMemoryFs(initial: Record<string, Uint8Array> = {}): MemoryFs {
  const files = new Map<string, Uint8Array>(Object.entries(initial));
  const must = (uri: string): Uint8Array => {
    const bytes = files.get(uri);
    if (!bytes) throw new Error(`memory fs: no file ${uri}`);
    return bytes;
  };
  return {
    files,
    get: must,
    set: (uri, bytes) => {
      files.set(uri, bytes);
    },
    size: async (uri) => must(uri).length,
    read: async (uri, position, length) => must(uri).slice(position, position + length),
    create: async (uri) => {
      files.set(uri, new Uint8Array(0));
    },
    append: async (uri, bytes) => {
      files.set(uri, concat(must(uri), bytes));
    },
  };
}
