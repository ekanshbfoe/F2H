import { File, UploadType } from 'expo-file-system';

import {
  chunked,
  createSha256,
  envelope,
  fromBase64,
  fromHex,
  randomBlobId,
  randomUuid,
  toBase64,
  toHex,
  zero,
} from '@/crypto';
import { withKey } from '@/features/lock/api';
import { listItems } from '@/features/vault/items';
import { expoFileAdapter, removeFile, scratchUri } from '@/services/file-adapter';
import { callFunction } from '@/services/functions';
import { getDeviceToken, supabase } from '@/services/supabase';

import {
  lastByteFromRange,
  parsePayload,
  safeName,
  UPLOAD_CHUNK,
  uploadRanges,
  type BlobState,
  type FilePayload,
  type StoredFile,
} from './model';

/**
 * Files on two Google Drives (child spec 0001-drive-redundancy). The phone encrypts to a cache
 * file one chunk at a time, PUTs the ciphertext straight to both resumable sessions, and asks the
 * server to verify both copies by hash before the item exists. Downloads verify the hash before
 * decrypting. Every key operation runs on a copy of the master key through `withKey`.
 */

export class FilesError extends Error {
  constructor(
    readonly code:
      | 'no_drive_linked'
      | 'too_large'
      | 'upload_failed'
      | 'hash_mismatch'
      | 'download_failed'
      | 'no_healthy_copy'
      | 'not_found',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'FilesError';
  }
}

export interface UploadProgress {
  phase: 'encrypting' | 'uploading' | 'verifying' | 'done';
  /** 0..1 per Drive; null when that Drive has no session */
  a: number | null;
  b: number | null;
}

export interface PickedFile {
  uri: string;
  name: string;
  mime: string;
  size: number;
}

interface SessionResponse {
  blob_id: string;
  session_a: string | null;
  session_b: string | null;
}

/** Asks a resumable session how far it got: -1 when nothing arrived, total-1 when complete. */
async function sessionStatus(session: string, total: number): Promise<number> {
  const res = await fetch(session, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${total}`, 'Content-Length': '0' },
  });
  if (res.status === 200 || res.status === 201) return total - 1;
  if (res.status === 308) return lastByteFromRange(res.headers.get('Range'));
  throw new FilesError('upload_failed', `session status ${res.status}`);
}

/**
 * Sends the ciphertext file to one session in 1 MiB ranges. A dropped request asks the session
 * where it stopped and carries on from there, up to 3 times in a row.
 */
async function sendToSession(
  ctUri: string,
  session: string,
  total: number,
  onProgress: (fraction: number) => void,
): Promise<void> {
  let next = 0;
  let failures = 0;
  const chunkUri = scratchUri('f2h-upload', `${toHex(randomBlobId())}.part`);
  try {
    while (next < total) {
      const [range] = uploadRanges(total, next, UPLOAD_CHUNK);
      if (!range) break;
      const bytes = await expoFileAdapter.read(ctUri, range.start, range.end - range.start + 1);
      await expoFileAdapter.create(chunkUri);
      await expoFileAdapter.append(chunkUri, bytes);
      try {
        const res = await new File(chunkUri).upload(session, {
          httpMethod: 'PUT',
          uploadType: UploadType.BINARY_CONTENT,
          headers: { 'Content-Range': `bytes ${range.start}-${range.end}/${total}` },
        });
        if (res.status === 308 || res.status === 200 || res.status === 201) {
          next = range.end + 1;
          failures = 0;
          onProgress(next / total);
          continue;
        }
        throw new FilesError('upload_failed', `chunk ${res.status}`);
      } catch (e) {
        failures += 1;
        if (failures > 3) throw e instanceof FilesError ? e : new FilesError('upload_failed');
        next = (await sessionStatus(session, total).catch(() => next - 1)) + 1;
      }
    }
  } finally {
    removeFile(chunkUri);
  }
}

/** Encrypts, uploads to both Drives, and creates the item after the server verified the copies. */
export async function uploadFile(
  picked: PickedFile,
  onProgress: (p: UploadProgress) => void,
): Promise<{ item: StoredFile; state: BlobState }> {
  const blobId = randomBlobId();
  const blobHex = toHex(blobId);
  const itemId = randomUuid();
  const ctUri = scratchUri('f2h-upload', `${blobHex}.ct`);
  onProgress({ phase: 'encrypting', a: null, b: null });
  try {
    return await withKey(async (mk, assertLive) => {
      const dek = envelope.generateDek();
      try {
        // every failure names its step, so a development build can show where an upload stopped
        let enc: Awaited<ReturnType<typeof chunked.encryptFile>>;
        try {
          enc = await chunked.encryptFile(picked.uri, dek, blobId, {
            fs: expoFileAdapter,
            outputUri: ctUri,
          });
        } catch (e) {
          throw new FilesError(
            'upload_failed',
            `encrypt: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        assertLive();
        let session: SessionResponse;
        try {
          session = await callFunction<SessionResponse>('drive-upload-session', {
            blob_id: blobHex,
            size_ct: enc.sizeCt,
            sha256_ct: enc.sha256Ct,
            chunk_size: enc.chunkSize,
            total_chunks: enc.totalChunks,
          });
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code === 'no_drive_linked' || code === 'no_drive_reachable')
            throw new FilesError('no_drive_linked');
          if (code === 'too_large') throw new FilesError('too_large');
          throw new FilesError(
            'upload_failed',
            `session: ${code ?? (e instanceof Error ? e.message : String(e))}`,
          );
        }
        const progress: UploadProgress = {
          phase: 'uploading',
          a: session.session_a ? 0 : null,
          b: session.session_b ? 0 : null,
        };
        onProgress({ ...progress });
        // One Drive failing is tolerated: the server marks the blob degraded and reconcile repairs it.
        const sendErrors: string[] = [];
        for (const slot of ['a', 'b'] as const) {
          const url = slot === 'a' ? session.session_a : session.session_b;
          if (!url) continue;
          try {
            await sendToSession(ctUri, url, enc.sizeCt, (f) => {
              progress[slot] = f;
              onProgress({ ...progress });
            });
          } catch (e) {
            sendErrors.push(`${slot}: ${e instanceof Error ? e.message : String(e)}`);
            progress[slot] = null;
            onProgress({ ...progress });
          }
        }
        if (progress.a === null && progress.b === null) {
          throw new FilesError('upload_failed', `drive ${sendErrors.join('; ') || 'no session'}`);
        }
        onProgress({ ...progress, phase: 'verifying' });
        const payload: FilePayload = {
          v: 1,
          type: 'file',
          name: picked.name.slice(0, 200) || 'file',
          mime: picked.mime || 'application/octet-stream',
          size: enc.size,
          blob_id: blobHex,
          sha256_ct: enc.sha256Ct,
          size_ct: enc.sizeCt,
          chunk_size: enc.chunkSize,
          total_chunks: enc.totalChunks,
          added_at: new Date().toISOString(),
        };
        assertLive();
        let done: { item_id: string; state: BlobState };
        try {
          done = await callFunction('drive-upload-complete', {
            blob_id: blobHex,
            item_id: itemId,
            dek_wrapped: toBase64(envelope.wrapDek(mk, dek, itemId)),
            ciphertext: toBase64(envelope.encryptItem(dek, JSON.stringify(payload), itemId)),
          });
        } catch (e) {
          if ((e as { code?: string }).code === 'hash_mismatch')
            throw new FilesError('hash_mismatch');
          throw new FilesError(
            'upload_failed',
            `complete: ${(e as { code?: string }).code ?? (e instanceof Error ? e.message : String(e))}`,
          );
        }
        onProgress({ ...progress, phase: 'done' });
        return { item: { id: done.item_id, version: 1, payload }, state: done.state };
      } finally {
        zero(dek);
      }
    });
  } finally {
    removeFile(ctUri);
  }
}

/** The member's live file items, decrypted, with each blob's state for the badges. */
export async function listFiles(): Promise<{
  items: StoredFile[];
  states: Record<string, BlobState>;
  skipped: number;
  offline: boolean;
}> {
  const { items, skipped, offline } = await listItems('file', parsePayload);
  const states: Record<string, BlobState> = {};
  if (!offline) {
    const { data } = await supabase.from('file_blobs').select('item_id, state');
    for (const row of data ?? []) if (row.item_id) states[row.item_id] = row.state as BlobState;
  }
  return { items, states, skipped, offline };
}

interface TokenResponse {
  mode: 'token' | 'proxy';
  url: string;
  token?: string;
}

async function hashFile(uri: string, size: number): Promise<string> {
  const h = createSha256();
  for (let pos = 0; pos < size; pos += UPLOAD_CHUNK) {
    h.update(await expoFileAdapter.read(uri, pos, UPLOAD_CHUNK));
  }
  return toHex(h.digest());
}

/**
 * Downloads the healthy copy to the cache, refuses it unless its hash matches the item, then
 * decrypts it next to the cache for opening. The caller shares or views the returned file.
 */
export async function downloadFile(item: StoredFile): Promise<string> {
  const p = item.payload;
  let token: TokenResponse;
  try {
    token = await callFunction<TokenResponse>('drive-download-token', { blob_id: p.blob_id });
  } catch (e) {
    const code = (e as { code?: string }).code;
    throw new FilesError(code === 'no_healthy_copy' ? 'no_healthy_copy' : 'download_failed', code);
  }
  const ctUri = scratchUri('f2h-download', `${p.blob_id}.ct`);
  const outUri = scratchUri('f2h-open', safeName(p.name));
  removeFile(ctUri);
  try {
    let headers: Record<string, string>;
    if (token.mode === 'proxy') {
      const { data } = await supabase.auth.getSession();
      headers = {
        Authorization: `Bearer ${data.session?.access_token ?? ''}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        ...(getDeviceToken() ? { 'x-f2h-device': getDeviceToken() ?? '' } : {}),
      };
    } else {
      headers = { Authorization: `Bearer ${token.token ?? ''}` };
    }
    await File.downloadFileAsync(token.url, new File(ctUri), { headers });
    const size = await expoFileAdapter.size(ctUri);
    if (size !== p.size_ct || (await hashFile(ctUri, size)) !== p.sha256_ct) {
      throw new FilesError('hash_mismatch');
    }
    return await withKey(async (mk) => {
      const { data: row } = await supabase
        .from('vault_items')
        .select('dek_wrapped')
        .eq('id', item.id)
        .maybeSingle();
      if (!row) throw new FilesError('not_found');
      const dek = envelope.unwrapDek(mk, fromBase64(row.dek_wrapped), item.id);
      try {
        await chunked.decryptFile(ctUri, dek, fromHex(p.blob_id), {
          fs: expoFileAdapter,
          outputUri: outUri,
        });
      } finally {
        zero(dek);
      }
      return outUri;
    });
  } catch (e) {
    removeFile(outUri);
    throw e instanceof FilesError
      ? e
      : new FilesError('download_failed', e instanceof Error ? e.message : undefined);
  } finally {
    removeFile(ctUri);
  }
}

export async function deleteFile(itemId: string): Promise<void> {
  try {
    await callFunction('drive-delete', { item_id: itemId });
  } catch (e) {
    const code = (e as { code?: string }).code;
    throw new FilesError(code === 'item_not_found' ? 'not_found' : 'download_failed', code);
  }
}
