/**
 * drive-download-token (child spec 0001-drive-redundancy, AC-8, AC-13): the owner of a blob, on an
 * approved phone, gets a one hour `drive.file` token for the healthy copy (slot `a` first). With
 * `DOWNLOAD_MODE=proxy` the POST answers with a proxy URL instead, and a GET on that URL streams
 * the ciphertext through this function (Range passed through). Reads are private: no audit row.
 */
import { requireApprovedDevice } from '../_shared/auth.ts';
import { handle, HttpError, json, readJson } from '../_shared/errors.ts';
import { accessToken, downloadFile, type Slot } from '../_shared/google.ts';
import { serviceClient } from '../_shared/supabase.ts';

const HEX32 = /^[0-9a-f]{32}$/;

async function pick(userId: string, blobId: string) {
  if (!HEX32.test(blobId)) throw new HttpError(400, 'bad_blob');
  const db = serviceClient();
  const { data: blob } = await db
    .from('file_blobs')
    .select('owner_id, state, drive_a_file_id, drive_b_file_id, size_ct')
    .eq('id', `\\x${blobId}`)
    .maybeSingle();
  if (!blob || blob.owner_id !== userId) throw new HttpError(404, 'blob_not_found');
  if (blob.state !== 'ok' && blob.state !== 'degraded') throw new HttpError(503, 'no_healthy_copy');
  const { data: accounts } = await db.from('drive_accounts').select('slot').eq('status', 'active');
  const active = new Set((accounts ?? []).map((a) => a.slot as Slot));
  const order: { slot: Slot; file: string | null }[] = [
    { slot: 'a', file: blob.drive_a_file_id },
    { slot: 'b', file: blob.drive_b_file_id },
  ];
  for (const o of order) {
    if (!o.file || !active.has(o.slot)) continue;
    try {
      return {
        slot: o.slot,
        file: o.file,
        token: await accessToken(db, o.slot),
        size: Number(blob.size_ct),
      };
    } catch {
      // try the other copy
    }
  }
  throw new HttpError(503, 'no_healthy_copy');
}

Deno.serve(
  handle(async (req) => {
    const caller = await requireApprovedDevice(req);
    const proxy = (Deno.env.get('DOWNLOAD_MODE') ?? 'token') === 'proxy';

    if (req.method === 'GET') {
      if (!proxy) throw new HttpError(404, 'proxy_disabled');
      const blobId = new URL(req.url).searchParams.get('blob_id') ?? '';
      const p = await pick(caller.user.id, blobId);
      const upstream = await downloadFile(p.token, p.file, req.headers.get('Range') ?? undefined);
      if (!upstream.ok && upstream.status !== 206)
        throw new HttpError(502, 'drive_download_failed');
      const headers = new Headers({ 'Content-Type': 'application/octet-stream' });
      for (const h of ['Content-Length', 'Content-Range', 'Accept-Ranges']) {
        const v = upstream.headers.get(h);
        if (v) headers.set(h, v);
      }
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const body = await readJson<{ blob_id?: string }>(req);
    const blobId = String(body.blob_id ?? '').toLowerCase();
    const p = await pick(caller.user.id, blobId);
    if (proxy) {
      const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/drive-download-token?blob_id=${blobId}`;
      return json({ mode: 'proxy', url, slot: p.slot, size_ct: p.size });
    }
    return json({
      mode: 'token',
      slot: p.slot,
      file_id: p.file,
      token: p.token,
      url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(p.file)}?alt=media`,
      expires_at: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
      size_ct: p.size,
    });
  }),
);
