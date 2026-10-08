import { box, fromBase64, randomUuid, toBase64 } from '@/crypto';
import { getDeviceInfo } from '@/services/device-info';
import { callFunction, FunctionError } from '@/services/functions';
import { getPushToken } from '@/services/push';
import { SecureKeys, secureDelete, secureGet, secureSet } from '@/services/secure-store';
import { setDeviceToken } from '@/services/supabase';

export type DeviceStatus = 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired';

export interface DeviceIdentity {
  /** base64 X25519 public key, sent to the server; grants are sealed to it */
  pubkey: string;
  nonce: string;
}

export interface DevicePayload {
  model: string;
  os: string;
  app_version: string;
  name: string;
  pubkey: string;
  push_token: string | null;
}

/** Stable per install: an X25519 keypair in SecureStore and the registration nonce (idempotency). */
export async function ensureDeviceIdentity(): Promise<DeviceIdentity> {
  let secret = await secureGet(SecureKeys.deviceKey);
  if (!secret) {
    const pair = box.generateKeypair();
    secret = toBase64(pair.secretKey);
    await secureSet(SecureKeys.deviceKey, secret);
    pair.secretKey.fill(0);
  }
  let nonce = await secureGet(SecureKeys.registrationNonce);
  if (!nonce) {
    nonce = randomUuid();
    await secureSet(SecureKeys.registrationNonce, nonce);
  }
  const secretBytes = fromBase64(secret);
  const pubkey = toBase64(box.publicKeyOf(secretBytes));
  secretBytes.fill(0);
  return { pubkey, nonce };
}

export async function deviceSecretKey(): Promise<Uint8Array | null> {
  const secret = await secureGet(SecureKeys.deviceKey);
  return secret ? fromBase64(secret) : null;
}

export async function buildDevicePayload(): Promise<{ device: DevicePayload; nonce: string }> {
  const info = getDeviceInfo();
  const identity = await ensureDeviceIdentity();
  const pushToken = await getPushToken();
  return {
    device: { ...info, pubkey: identity.pubkey, push_token: pushToken },
    nonce: identity.nonce,
  };
}

export interface Registration {
  deviceId: string;
  status: DeviceStatus;
}

/**
 * Registers this phone for the signed in account (AC-6). The token comes back exactly once and
 * goes straight into SecureStore and the request header. A 409 means a request is already
 * waiting: the stored id is kept and the screen keeps watching it.
 */
export async function registerDevice(retried = false): Promise<Registration> {
  const { device, nonce } = await buildDevicePayload();
  try {
    const res = await callFunction<{
      device_id: string;
      device_token: string;
      status: DeviceStatus;
    }>('register-device', { device, nonce });
    await setDeviceToken(res.device_token);
    await secureSet(SecureKeys.deviceId, res.device_id);
    return { deviceId: res.device_id, status: res.status };
  } catch (error) {
    if (error instanceof FunctionError && error.code === 'pending_exists') {
      // Only this install's own request may be resumed; another phone's request is never adopted.
      const stored = await secureGet(SecureKeys.deviceId);
      const serverId = error.payload?.device_id as string | undefined;
      if (stored && serverId === stored) return { deviceId: stored, status: 'pending' };
      throw error;
    }
    if (error instanceof FunctionError && error.code === 'nonce_used') {
      // Our own approved registration answered: keep it, the stored token is still valid.
      const stored = await secureGet(SecureKeys.deviceId);
      const hasToken = (await secureGet(SecureKeys.deviceToken)) !== null;
      if (error.payload?.status === 'approved' && stored && hasToken) {
        return { deviceId: stored, status: 'approved' };
      }
      if (!retried) {
        // The old request is closed (rejected, expired, cancelled): start a fresh one.
        await secureDelete(SecureKeys.registrationNonce);
        await secureDelete(SecureKeys.deviceId);
        return registerDevice(true);
      }
    }
    throw error;
  }
}
