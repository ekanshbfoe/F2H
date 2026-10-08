import * as SecureStore from 'expo-secure-store';

/**
 * Keys this app keeps in the Keychain / Keystore. Values are strings (base64 for bytes).
 * Only `src/crypto/` interprets the key material; this module just stores and fetches.
 */
export const SecureKeys = {
  deviceToken: 'f2h.device_token',
  deviceId: 'f2h.device_id',
  deviceSecret: 'f2h.device_secret',
  deviceSalt: 'f2h.device_salt',
  mkWrappedLocal: 'f2h.mk_wrapped_local',
  mkWrappedBio: 'f2h.mk_wrapped_bio',
  /** The user id `mk_wrapped_local` belongs to (spec 0002). */
  lockOwner: 'f2h.lock_owner',
  /** JSON `{ failures, remainingMs }`, written before every PIN derivation (spec 0002). */
  lockAttempts: 'f2h.lock_attempts',
  /** X25519 secret of this device (recovery grants are sealed to its public key). */
  deviceKey: 'f2h.device_key',
  registrationNonce: 'f2h.registration_nonce',
  recoveryItemId: 'f2h.recovery_item_id',
} as const;

export type SecureKey = (typeof SecureKeys)[keyof typeof SecureKeys];

/**
 * Lock material is only readable while the phone is unlocked and never migrates to another
 * device (iOS keychain accessibility; Android ignores the option).
 */
const lockOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const LOCK_KEYS: ReadonlySet<string> = new Set([
  SecureKeys.deviceSecret,
  SecureKeys.deviceSalt,
  SecureKeys.mkWrappedLocal,
  SecureKeys.mkWrappedBio,
  SecureKeys.lockOwner,
  SecureKeys.lockAttempts,
]);
const optionsFor = (key: SecureKey) => (LOCK_KEYS.has(key) ? lockOptions : undefined);

export async function secureGet(key: SecureKey): Promise<string | null> {
  return SecureStore.getItemAsync(key, optionsFor(key));
}

export async function secureSet(key: SecureKey, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, optionsFor(key));
}

export async function secureDelete(key: SecureKey): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

/** Removes every F2H entry; used on device revoke, rejection and the ten failure wipe. */
export async function secureWipe(): Promise<void> {
  await Promise.all(Object.values(SecureKeys).map((key) => SecureStore.deleteItemAsync(key)));
}
