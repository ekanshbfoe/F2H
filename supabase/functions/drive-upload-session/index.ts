/**
 * drive-upload-session (child spec 0001-drive-redundancy, AC-3): records the blob as `uploading`
 * and opens one resumable session per linked Drive. Only the session URLs go back to the phone,
 * never a token. A Drive that cannot open a session comes back as null (the other still works).
 */
import { requireApprovedDevice } from '../_shared/auth.ts';
import { handle, HttpError, json, readJson } from '../_shared/errors.ts';
import { accessToken, SLOTS, startResumable, type Slot } from '../_shared/google.ts';
import { serviceClient } from '../_shared/supabase.ts';

const HEX32 = /^[0-9a-f]{32}$/;
const HEX64 = /^[0-9a-f]{64}$/;

interface Body {
  blob_id?: string;
  size_ct?: number;
  sha256_ct?: string;
  chunk_size?: number;
  total_chunks?: number;
}

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const caller = await requireApprovedDevice(req);
    const b = await readJson<Body>(req);
    const blobId = String(b.blob_id ?? '').toLowerCase();
    const sha = String(b.sha256_ct ?? '').toLowerCase();
    const size = Number(b.size_ct);
    const chunk = Number(b.chunk_size);
    const total = Number(b.total_chunks);
    if (!HEX32.test(blobId) || !HEX64.test(sha)) throw new HttpError(400, 'bad_blob');
    if (
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      !Number.isSafeInteger(chunk) ||
      chunk <= 0 ||
      !Number.isSafeInteger(total) ||
      total <= 0
    ) {
      throw new HttpError(400, 'bad_blob');
    }
    const max = Number(Deno.env.get('MAX_BLOB_BYTES') ?? 2 * 1024 * 1024 * 1024);
    if (size > max) throw new HttpError(413, 'too_large');

    const db = serviceClient();
    const { data: accounts } = await db
      .from('drive_accounts')
      .select('slot, root_folder_id, status')
      .eq('status', 'active');
    const active = (accounts ?? []).filter((a) => SLOTS.includes(a.slot as Slot));
    if (active.length === 0) throw new HttpError(503, 'no_drive_linked');

    const { error: insertError } = await db.from('file_blobs').insert({
      id: `\\x${blobId}`,
      owner_id: caller.user.id,
      size_ct: size,
      sha256: `\\x${sha}`,
      chunk_size: chunk,
      total_chunks: total,
      state: 'uploading',
    });
    if (insertError) {
      if (insertError.code === '23505') throw new HttpError(409, 'blob_exists');
      throw new HttpError(500, 'blob_insert_failed');
    }

    const sessions: Record<Slot, string | null> = { a: null, b: null };
    for (const account of active) {
      const slot = account.slot as Slot;
      try {
        const token = await accessToken(db, slot);
        sessions[slot] = await startResumable(token, {
          name: `${blobId}.bin`,
          parent: account.root_folder_id,
          size,
          appProperties: { owner: caller.user.id, blob_id: blobId },
        });
      } catch (e) {
        console.error('upload-session', slot, e instanceof Error ? e.message : String(e));
      }
    }
    if (!sessions.a && !sessions.b) {
      await db.from('file_blobs').delete().eq('id', `\\x${blobId}`);
      throw new HttpError(503, 'no_drive_reachable');
    }
    return json({ blob_id: blobId, session_a: sessions.a, session_b: sessions.b });
  }),
);
