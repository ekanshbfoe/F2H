import * as aead from './aead';
import { concat, utf8ToBytes } from './encoding';
import { assertLength } from './errors';
import { hkdf, SCRYPT_DEFAULT, scryptAsync, type ScryptParams } from './kdf';
import { randomBytes } from './random';

export const DEVICE_SECRET_LEN = 32;
export const DEVICE_SALT_LEN = 16;
const LOCAL_AAD = 'local';
const BIO_AAD = 'bio';

/** Generated once per install and kept in SecureStore by the lock feature. */
export const generateDeviceSecret = (): Uint8Array => randomBytes(DEVICE_SECRET_LEN);
export const generateDeviceSalt = (): Uint8Array => randomBytes(DEVICE_SALT_LEN);

/**
 * Daily unlock key: `pinKey = scrypt(PIN, device_salt)`,
 * `wrapKey = hkdf(pinKey || device_secret, salt "f2h:local", info "f2h:local-wrap:v1")`.
 * An attacker needs both the hardware stored device secret and the PIN.
 */
export async function deriveLocalWrapKey(
  pin: string,
  deviceSalt: Uint8Array,
  deviceSecret: Uint8Array,
  params: ScryptParams = SCRYPT_DEFAULT,
): Promise<Uint8Array> {
  assertLength(deviceSalt, DEVICE_SALT_LEN, 'device salt');
  assertLength(deviceSecret, DEVICE_SECRET_LEN, 'device secret');
  const pinKey = await scryptAsync(utf8ToBytes(pin), deviceSalt, params);
  const ikm = concat(pinKey, deviceSecret);
  const wrapKey = hkdf(ikm, 'f2h:local', 'f2h:local-wrap:v1', 32);
  pinKey.fill(0);
  ikm.fill(0);
  return wrapKey;
}

/** `mk_wrapped_local = aead(wrapKey, MK, aad "local")`, stored in SecureStore. */
export const wrapMkLocal = (wrapKey: Uint8Array, mk: Uint8Array): Uint8Array =>
  aead.seal(wrapKey, mk, LOCAL_AAD);
export const unwrapMkLocal = (wrapKey: Uint8Array, wire: Uint8Array): Uint8Array =>
  aead.open(wrapKey, wire, LOCAL_AAD);

/** Biometric path (Expo Go fallback): `hkdf(device_secret, salt "f2h:bio", info "f2h:bio-wrap:v1")`. */
export function deriveBioWrapKey(deviceSecret: Uint8Array): Uint8Array {
  assertLength(deviceSecret, DEVICE_SECRET_LEN, 'device secret');
  return hkdf(deviceSecret, 'f2h:bio', 'f2h:bio-wrap:v1', 32);
}

export const wrapMkBio = (bioKey: Uint8Array, mk: Uint8Array): Uint8Array =>
  aead.seal(bioKey, mk, BIO_AAD);
export const unwrapMkBio = (bioKey: Uint8Array, wire: Uint8Array): Uint8Array =>
  aead.open(bioKey, wire, BIO_AAD);
