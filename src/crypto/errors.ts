export type CryptoErrorCode =
  'bad_version' | 'bad_length' | 'bad_format' | 'auth_failed' | 'bad_mnemonic' | 'bad_key';

/** The only error type `src/crypto/` throws. Messages never include key or plaintext bytes. */
export class CryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'CryptoError';
    this.code = code;
  }
}

export function assertLength(bytes: Uint8Array, expected: number, what: string): void {
  if (bytes.length !== expected) {
    throw new CryptoError('bad_length', `${what} must be ${expected} bytes`);
  }
}
