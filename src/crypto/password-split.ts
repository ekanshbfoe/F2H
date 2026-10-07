import { toBase64Url, utf8ToBytes } from './encoding';
import { hkdf, SCRYPT_DEFAULT, scrypt, scryptAsync, type ScryptParams } from './kdf';

export interface PasswordSplit {
  /** Sent to Supabase as the "password". 43 chars of unpadded base64url (32 bytes). */
  authSecret: string;
  /** Key encryption key for `mk_wrapped_pw`. Never leaves the phone. */
  kek: Uint8Array;
}

/** Lowercase and trim, so the same account always derives the same salt. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function finish(stretched: Uint8Array): PasswordSplit {
  const split = {
    authSecret: toBase64Url(hkdf(stretched, 'f2h:auth', 'auth:v1', 32)),
    kek: hkdf(stretched, 'f2h:kek', 'kek:v1', 32),
  };
  stretched.fill(0);
  return split;
}

function saltFor(email: string): Uint8Array {
  return utf8ToBytes(`f2h:pw:v1:${normalizeEmail(email)}`);
}

/**
 * Zero knowledge login split. `stretched = scrypt(password, "f2h:pw:v1:" + lower(email))`,
 * then two independent HKDF outputs: one half logs in, the other half wraps the Master Key.
 * Supabase only ever sees a bcrypt of `authSecret`, never the password or the KEK.
 */
export async function passwordSplit(
  email: string,
  password: string,
  params: ScryptParams = SCRYPT_DEFAULT,
): Promise<PasswordSplit> {
  return finish(await scryptAsync(utf8ToBytes(password), saltFor(email), params));
}

/** Blocking variant for scripts and tests. */
export function passwordSplitSync(
  email: string,
  password: string,
  params: ScryptParams = SCRYPT_DEFAULT,
): PasswordSplit {
  return finish(scrypt(utf8ToBytes(password), saltFor(email), params));
}
