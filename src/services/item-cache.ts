import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Read only offline copy of vault rows (spec 0005, AC-7). It stores exactly what the server
 * stores (the wrapped DEK and the ciphertext), never plaintext, scoped by owner and kind. It is
 * erased on sign out and on every wipe. `expo-sqlite` is loaded lazily so code paths that never
 * touch the cache (and their tests) do not load the native module.
 */

export interface CachedRow {
  id: string;
  version: number;
  dek_wrapped: string;
  ciphertext: string;
}

const DB_NAME = 'f2h-cache.db';
let dbPromise: Promise<SQLiteDatabase> | null = null;

async function db(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
      const d = await SQLite.openDatabaseAsync(DB_NAME);
      await d.execAsync(
        `create table if not exists items_cache (
           owner_id text not null, kind text not null, id text not null,
           version integer not null, dek_wrapped text not null, ciphertext text not null,
           primary key (owner_id, id));
         create index if not exists items_cache_kind on items_cache (owner_id, kind);`,
      );
      return d;
    })().catch((e: unknown) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

/** Replaces the cached rows of one kind for one owner with the rows just loaded. */
export async function cacheRows(ownerId: string, kind: string, rows: CachedRow[]): Promise<void> {
  const d = await db();
  await d.withTransactionAsync(async () => {
    await d.runAsync('delete from items_cache where owner_id = ? and kind = ?', ownerId, kind);
    for (const r of rows) {
      await d.runAsync(
        'insert or replace into items_cache (owner_id, kind, id, version, dek_wrapped, ciphertext) values (?, ?, ?, ?, ?, ?)',
        ownerId,
        kind,
        r.id,
        r.version,
        r.dek_wrapped,
        r.ciphertext,
      );
    }
  });
}

export async function cachedRows(ownerId: string, kind: string): Promise<CachedRow[]> {
  const d = await db();
  return d.getAllAsync<CachedRow>(
    'select id, version, dek_wrapped, ciphertext from items_cache where owner_id = ? and kind = ? order by rowid',
    ownerId,
    kind,
  );
}

/** Erases the whole offline copy (sign out, wipe). Never throws. */
export async function eraseItemCache(): Promise<void> {
  try {
    const d = await db();
    await d.execAsync('delete from items_cache;');
  } catch {
    // no cache was ever created, or the database is gone already
  }
}
