/**
 * KDF benchmark (AC-12 of spec 0001-crypto-envelope).
 *
 * Node run (dev machine reference, no dependencies beyond the installed @noble/hashes):
 *   node scripts/bench-kdf.ts
 *
 * Phone run: open the dev gallery in Expo Go and press "Run KDF benchmark" in the
 * "Crypto bench" card; it calls the same `benchScrypt` from `src/crypto/bench.ts`.
 * Record both results in the comment on `SCRYPT_DEFAULT` in `src/crypto/kdf.ts`.
 *
 * This file stays self contained (it imports @noble directly) because Node's type
 * stripping cannot follow the extensionless imports used by the app bundle.
 */
import { scrypt } from '@noble/hashes/scrypt.js';

const password = new TextEncoder().encode('bench-password');
const salt = new TextEncoder().encode('f2h:bench:salt');
const costs = [2 ** 13, 2 ** 14, 2 ** 15, 2 ** 16];

console.log(`scrypt r=8 p=1 dkLen=32 on Node ${process.version}`);
for (const N of costs) {
  const started = performance.now();
  scrypt(password, salt, { N, r: 8, p: 1, dkLen: 32 });
  const ms = Math.round(performance.now() - started);
  console.log(`N=2^${Math.log2(N)} (${(128 * N * 8) / 1024 / 1024} MiB): ${ms} ms`);
}
