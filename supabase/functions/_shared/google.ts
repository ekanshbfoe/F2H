/**
 * Google OAuth and Drive v3 over plain fetch (child spec 0001-drive-redundancy). Refresh tokens
 * come from Vault through `drive_refresh_token`; access tokens live only for one invocation.
 * A refused refresh token marks the slot `needs_relink` and pushes the Admin (AC-2).
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { bytesToHex } from './challenge.ts';
import { HttpError } from './errors.ts';
import { base64ToBytes, bytesToBase64 } from './hash.ts';
import { sendPush } from './push.ts';

export type Slot = 'a' | 'b';
export const SLOTS: readonly Slot[] = ['a', 'b'];
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const ROOT_FOLDER = 'F2H Vault';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new HttpError(500, 'config_missing', `${name} is not set`);
  return v;
}

export function redirectUri(): string {
  return `${env('SUPABASE_URL')}/functions/v1/drive-link-callback`;
}

// ---------- signed OAuth state (HMAC SHA 256 over the JSON, base64url) ----------

export interface LinkState {
  slot: Slot;
  admin: string;
  return_url: string;
  nonce: string;
  exp: number;
}

function b64url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return base64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

async function hmac(secret: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data as BufferSource));
}

export async function signState(
  state: LinkState,
  secret = env('DRIVE_STATE_SECRET'),
): Promise<string> {
  const body = new TextEncoder().encode(JSON.stringify(state));
  return `${b64url(body)}.${b64url(await hmac(secret, body))}`;
}

export async function verifyState(
  token: string,
  secret = env('DRIVE_STATE_SECRET'),
  now = Date.now(),
): Promise<LinkState> {
  const [body, mac] = token.split('.');
  if (!body || !mac) throw new HttpError(400, 'bad_state');
  let bytes: Uint8Array;
  let given: Uint8Array;
  try {
    bytes = fromB64url(body);
    given = fromB64url(mac);
  } catch {
    throw new HttpError(400, 'bad_state');
  }
  const want = await hmac(secret, bytes);
  let diff = want.length ^ given.length;
  for (let i = 0; i < want.length; i += 1) diff |= (want[i] ?? 0) ^ (given[i] ?? 0);
  if (diff !== 0) throw new HttpError(400, 'bad_state');
  const state = JSON.parse(new TextDecoder().decode(bytes)) as LinkState;
  if (!SLOTS.includes(state.slot) || state.exp < now) throw new HttpError(400, 'bad_state');
  return state;
}

/** Only app deep links may receive the user after linking: the Expo Go `exp://` URL or `f2h://`. */
export function isAllowedReturnUrl(url: string): boolean {
  return /^(exp|exps|f2h):\/\//i.test(url) && url.length <= 300;
}

export function authUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

// ---------- tokens ----------

export class GoogleAuthError extends Error {
  constructor(
    readonly slot: Slot | null,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

async function tokenRequest(params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      ...params,
    }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new GoogleAuthError(null, String(body.error ?? `token_http_${res.status}`));
  return body;
}

export async function exchangeCode(code: string): Promise<{ access: string; refresh: string }> {
  const body = await tokenRequest({
    code,
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
  });
  const access = String(body.access_token ?? '');
  const refresh = String(body.refresh_token ?? '');
  if (!access || !refresh) throw new GoogleAuthError(null, 'no_refresh_token');
  return { access, refresh };
}

const accessCache = new Map<Slot, { token: string; until: number }>();

/** A fresh access token for a linked slot; a refused refresh token marks the slot for relinking. */
export async function accessToken(db: SupabaseClient, slot: Slot): Promise<string> {
  const cached = accessCache.get(slot);
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const { data: refresh, error } = await db.rpc('drive_refresh_token', { p_slot: slot });
  if (error || !refresh) throw new GoogleAuthError(slot, 'not_linked');
  try {
    const body = await tokenRequest({
      refresh_token: String(refresh),
      grant_type: 'refresh_token',
    });
    const token = String(body.access_token ?? '');
    accessCache.set(slot, { token, until: Date.now() + Number(body.expires_in ?? 3600) * 1000 });
    return token;
  } catch (e) {
    if (e instanceof GoogleAuthError && /invalid_grant|unauthorized_client/.test(e.message)) {
      const { data: changed } = await db.rpc('drive_mark_relink', { p_slot: slot });
      if (changed)
        await pushAdmin(
          db,
          'Google Drive needs linking again',
          `Drive slot ${slot.toUpperCase()} stopped accepting F2H. Open F2H → Google Drives and link it again.`,
        );
    }
    throw new GoogleAuthError(slot, e instanceof Error ? e.message : 'token_failed');
  }
}

export async function pushAdmin(db: SupabaseClient, title: string, body: string): Promise<void> {
  const { data: config } = await db
    .from('family_config')
    .select('admin_user_id')
    .eq('id', 1)
    .maybeSingle();
  if (!config?.admin_user_id) return;
  const { data: devices } = await db
    .from('devices')
    .select('push_token')
    .eq('user_id', config.admin_user_id)
    .eq('status', 'approved');
  await sendPush(
    (devices ?? []).map((d) => d.push_token),
    { title, body, data: { screen: 'drive' } },
  );
}

// ---------- Drive ----------

async function drive(
  token: string,
  path: string,
  init: RequestInit = {},
  base = API,
): Promise<Response> {
  return fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
}

export async function aboutEmail(token: string): Promise<string> {
  const res = await drive(token, '/about?fields=user(emailAddress)');
  if (!res.ok) throw new HttpError(502, 'drive_about_failed');
  const body = (await res.json()) as { user?: { emailAddress?: string } };
  return body.user?.emailAddress ?? 'unknown';
}

export async function createFolder(token: string, name: string, parent?: string): Promise<string> {
  const res = await drive(token, '/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parent ? { parents: [parent] } : {}),
    }),
  });
  if (!res.ok) throw new HttpError(502, 'drive_folder_failed');
  return String(((await res.json()) as { id?: string }).id ?? '');
}

/** Opens a resumable session; the returned URL accepts chunk PUTs without a token (spike, 2026-10-07). */
export async function startResumable(
  token: string,
  opts: { name: string; parent: string; size: number; appProperties: Record<string, string> },
): Promise<string> {
  const res = await drive(
    token,
    '/files?uploadType=resumable&fields=id',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/octet-stream',
        'X-Upload-Content-Length': String(opts.size),
      },
      body: JSON.stringify({
        name: opts.name,
        parents: [opts.parent],
        appProperties: opts.appProperties,
      }),
    },
    UPLOAD,
  );
  const location = res.headers.get('Location');
  if (!res.ok || !location) throw new HttpError(502, 'drive_session_failed');
  return location;
}

export interface DriveFile {
  id: string;
  size: number;
  sha256: string | null;
  trashed: boolean;
}

export async function getFile(token: string, id: string): Promise<DriveFile | null> {
  const res = await drive(
    token,
    `/files/${encodeURIComponent(id)}?fields=id,size,sha256Checksum,trashed`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(502, 'drive_get_failed');
  const b = (await res.json()) as {
    id: string;
    size?: string;
    sha256Checksum?: string;
    trashed?: boolean;
  };
  return {
    id: b.id,
    size: Number(b.size ?? 0),
    sha256: b.sha256Checksum ?? null,
    trashed: Boolean(b.trashed),
  };
}

/** Files of this app whose `blob_id` app property matches (used to find an uploaded copy). */
export async function findByBlob(token: string, blobHex: string): Promise<DriveFile[]> {
  const q = `appProperties has { key='blob_id' and value='${blobHex}' } and trashed = false`;
  const res = await drive(
    token,
    `/files?q=${encodeURIComponent(q)}&fields=files(id,size,sha256Checksum,trashed)&pageSize=10`,
  );
  if (!res.ok) throw new HttpError(502, 'drive_list_failed');
  const b = (await res.json()) as {
    files?: { id: string; size?: string; sha256Checksum?: string; trashed?: boolean }[];
  };
  return (b.files ?? []).map((f) => ({
    id: f.id,
    size: Number(f.size ?? 0),
    sha256: f.sha256Checksum ?? null,
    trashed: Boolean(f.trashed),
  }));
}

/** A folder this app created under `parent`, by name (the `backups` folder made at link time). */
export async function findChildFolder(
  token: string,
  parent: string,
  name: string,
): Promise<string | null> {
  const q = `name = '${name.replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive(token, `/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  if (!res.ok) throw new HttpError(502, 'drive_list_failed');
  const b = (await res.json()) as { files?: { id: string }[] };
  return b.files?.[0]?.id ?? null;
}

export async function trashFile(token: string, id: string): Promise<void> {
  const res = await drive(token, `/files/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
  if (!res.ok && res.status !== 404) throw new HttpError(502, 'drive_trash_failed');
}

export async function downloadFile(token: string, id: string, range?: string): Promise<Response> {
  return drive(
    token,
    `/files/${encodeURIComponent(id)}?alt=media`,
    range ? { headers: { Range: range } } : {},
  );
}

/** Uploads a whole body in one request (reconcile re copy, small enough to fit the budget). */
export async function uploadWhole(
  token: string,
  opts: { name: string; parent: string; appProperties: Record<string, string> },
  body: Uint8Array,
): Promise<string> {
  const session = await startResumable(token, { ...opts, size: body.length });
  const res = await fetch(session, {
    method: 'PUT',
    headers: { 'Content-Length': String(body.length) },
    body: body as BodyInit,
  });
  if (!res.ok) throw new HttpError(502, 'drive_upload_failed');
  return String(((await res.json()) as { id?: string }).id ?? '');
}

export function blobHex(id: string | Uint8Array): string {
  if (typeof id === 'string') return id.startsWith('\\x') ? id.slice(2) : id;
  return bytesToHex(id);
}
