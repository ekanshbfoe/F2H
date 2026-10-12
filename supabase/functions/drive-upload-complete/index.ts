/**
 * drive-upload-complete (child spec 0001-drive-redundancy, AC-6, AC-7): checks every linked Drive
 * for this blob's file, compares size and `sha256Checksum` with what the phone declared, then
 * inserts the encrypted item and marks the blob `ok` (both copies) or `degraded` (one copy).
 * No good copy: the row and any stray copies go and the phone gets 422.
 */
import { requireApprovedDevice } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handle, HttpError, json, readJson } from '../_shared/errors.ts';
import {
  accessToken,
  blobHex,
  findByBlob,
  SLOTS,
  trashFile,
  type Slot,
} from '../_shared/google.ts';
import { serviceClient } from '../_shared/supabase.ts';

const HEX32 = /^[0-9a-f]{32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Body {
  blob_id?: string;
  item_id?: string;
  dek_wrapped?: string;
  ciphertext?: string;
}

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const caller = await requireApprovedDevice(req);
    const b = await readJson<Body>(req);
    const blobId = String(b.blob_id ?? '').toLowerCase();
    const itemId = String(b.item_id ?? '');
    const dekWrapped = String(b.dek_wrapped ?? '');
    const ciphertext = String(b.ciphertext ?? '');
    if (!HEX32.test(blobId) || !UUID.test(itemId)) throw new HttpError(400, 'bad_request');
    if (!dekWrapped || !ciphertext || ciphertext.length > 64 * 1024)
      throw new HttpError(400, 'bad_item');

    const db = serviceClient();
    const { data: blob } = await db
      .from('file_blobs')
      .select('size_ct, sha256, state, owner_id')
      .eq('id', `\\x${blobId}`)
      .maybeSingle();
    if (!blob || blob.owner_id !== caller.user.id) throw new HttpError(404, 'blob_not_found');
    if (blob.state !== 'uploading') throw new HttpError(409, 'blob_not_uploading');
    const wantSha = blobHex(String(blob.sha256));

    const { data: accounts } = await db
      .from('drive_accounts')
      .select('slot')
      .eq('status', 'active');
    const ids: Record<Slot, string | null> = { a: null, b: null };
    const strays: { slot: Slot; id: string }[] = [];
    for (const account of accounts ?? []) {
      const slot = account.slot as Slot;
      if (!SLOTS.includes(slot)) continue;
      try {
        const token = await accessToken(db, slot);
        for (const f of await findByBlob(token, blobId)) {
          if (!ids[slot] && f.size === Number(blob.size_ct) && f.sha256 === wantSha)
            ids[slot] = f.id;
          else strays.push({ slot, id: f.id });
        }
      } catch (e) {
        console.error('upload-complete', slot, e instanceof Error ? e.message : String(e));
      }
    }

    const cleanStrays = async () => {
      for (const s of strays) {
        try {
          await trashFile(await accessToken(db, s.slot), s.id);
        } catch {
          // reconcile sweeps whatever is left
        }
      }
    };

    if (!ids.a && !ids.b) {
      await cleanStrays();
      await db.from('file_blobs').delete().eq('id', `\\x${blobId}`);
      throw new HttpError(422, 'hash_mismatch');
    }

    const { error: itemError } = await db.from('vault_items').insert({
      id: itemId,
      owner_id: caller.user.id,
      kind: 'file',
      dek_wrapped: dekWrapped,
      ciphertext,
    });
    if (itemError) {
      if (itemError.code === '23505') throw new HttpError(409, 'item_exists');
      throw new HttpError(500, 'item_insert_failed');
    }
    const state = ids.a && ids.b ? 'ok' : 'degraded';
    const { error: blobError } = await db
      .from('file_blobs')
      .update({
        item_id: itemId,
        drive_a_file_id: ids.a,
        drive_b_file_id: ids.b,
        state,
        last_verified_at: new Date().toISOString(),
      })
      .eq('id', `\\x${blobId}`);
    if (blobError) throw new HttpError(500, 'blob_update_failed');
    await cleanStrays();
    await writeAudit(db, {
      actor_id: caller.user.id,
      actor_device_id: caller.device.id,
      action: 'file.upload',
      target_user_id: caller.user.id,
      target_item_id: itemId,
      meta: { state, size_ct: Number(blob.size_ct) },
    });
    return json({ item_id: itemId, state });
  }),
);
