import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { randomToken } from './audit.ts';
import { HttpError } from './errors.ts';
import { clientIp, geoLookup } from './geo.ts';
import { base64ToBytes, bytesToBase64, sha256Hex } from './hash.ts';

/** What the phone sends about itself when it registers. */
export interface DeviceInput {
  model: string;
  os: string;
  app_version: string;
  /** base64 X25519 public key, 32 bytes */
  pubkey: string;
  push_token?: string | null;
  nonce: string;
  name?: string;
}

export function parseDeviceInput(raw: unknown): DeviceInput {
  const d = (raw ?? {}) as Partial<DeviceInput>;
  const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.slice(0, max) : '');
  const nonce = str(d.nonce, 64);
  const pubkey = str(d.pubkey, 64);
  if (!nonce) throw new HttpError(400, 'bad_device', 'nonce is required');
  let pubBytes: Uint8Array;
  try {
    pubBytes = base64ToBytes(pubkey);
  } catch {
    throw new HttpError(400, 'bad_device', 'pubkey must be base64');
  }
  if (pubBytes.length !== 32) throw new HttpError(400, 'bad_device', 'pubkey must be 32 bytes');
  const pushToken =
    typeof d.push_token === 'string' && d.push_token.length > 0 ? d.push_token : null;
  return {
    model: str(d.model) || 'Unknown phone',
    os: str(d.os) || 'Unknown OS',
    app_version: str(d.app_version, 40) || '0.0.0',
    pubkey,
    push_token: pushToken,
    nonce,
    name: str(d.name, 60) || str(d.model) || 'Phone',
  };
}

export interface NewDevice {
  id: string;
  token: string;
  row: Record<string, unknown>;
}

/**
 * Builds a devices row with a fresh 32 byte token (returned once, base64) and the caller's
 * IP and approximate location. Only the token's sha256 is stored.
 */
export async function buildDeviceRow(
  req: Request,
  userId: string,
  input: DeviceInput,
  status: 'pending' | 'approved',
): Promise<NewDevice> {
  const tokenBytes = randomToken();
  const token = bytesToBase64(tokenBytes);
  const ip = clientIp(req);
  const geo = await geoLookup(ip);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  return {
    id,
    token,
    row: {
      id,
      user_id: userId,
      token_hash: await sha256Hex(tokenBytes),
      registration_nonce: input.nonce,
      name: input.name,
      model: input.model,
      os: input.os,
      app_version: input.app_version,
      pubkey: `\\x${bytesToHex(base64ToBytes(input.pubkey))}`,
      push_token: input.push_token,
      status,
      requested_at: now,
      decided_at: status === 'approved' ? now : null,
      last_ip: ip,
      last_geo: geo,
      last_seen_at: now,
    },
  };
}

/** Rotates a device token in place and returns the new base64 token. */
export async function rotateToken(db: SupabaseClient, deviceId: string): Promise<string> {
  const tokenBytes = randomToken();
  const { error } = await db
    .from('devices')
    .update({ token_hash: await sha256Hex(tokenBytes), last_seen_at: new Date().toISOString() })
    .eq('id', deviceId);
  if (error) throw new HttpError(500, 'token_rotate_failed');
  return bytesToBase64(tokenBytes);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
