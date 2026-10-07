import { utf8ToBytes } from './encoding';
import { scryptAsync, type ScryptParams } from './kdf';

export interface KdfBenchResult {
  N: number;
  ms: number;
}

const PASSWORD = utf8ToBytes('bench-password');
const SALT = utf8ToBytes('f2h:bench:salt');

/**
 * Times scrypt at a few cost values on the current device (AC-12). Run from the dev gallery
 * on a phone and copy the numbers into the comment on `SCRYPT_DEFAULT` in `kdf.ts`.
 * The largest cost, 2^9, takes about 5 s on the 1 GB reference phone; it yields to the UI between runs.
 */
export async function benchScrypt(
  costs: number[] = [2 ** 6, 2 ** 7, 2 ** 8, 2 ** 9],
  base: Omit<ScryptParams, 'N'> = { r: 8, p: 1, dkLen: 32 },
): Promise<KdfBenchResult[]> {
  const results: KdfBenchResult[] = [];
  for (const N of costs) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const started = Date.now();
    await scryptAsync(PASSWORD, SALT, { ...base, N });
    results.push({ N, ms: Date.now() - started });
  }
  return results;
}
