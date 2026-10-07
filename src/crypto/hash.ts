import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';

import { asBytes } from './encoding';

export function sha256(data: string | Uint8Array): Uint8Array {
  return nobleSha256(asBytes(data));
}

/** Incremental hasher for streaming ciphertext (the file hash both Drives are checked against). */
export function createSha256(): { update(data: Uint8Array): void; digest(): Uint8Array } {
  const hasher = nobleSha256.create();
  return {
    update: (data) => {
      hasher.update(data);
    },
    digest: () => hasher.digest(),
  };
}
