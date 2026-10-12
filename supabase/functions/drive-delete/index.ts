/**
 * drive-delete (child spec 0001-drive-redundancy, AC-11): the owner deletes a file item. Both
 * Drive copies go to the Drive trash (kept 30 days by Google), the item is soft deleted, the blob
 * row is removed, and an audit row is written.
 */
import { requireApprovedDevice } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handle, HttpError, json, readJson } from '../_shared/errors.ts';
import { accessToken, trashFile, type Slot } from '../_shared/google.ts';
import { serviceClient } from '../_shared/supabase.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const caller = await requireApprovedDevice(req);
    const { item_id } = await readJson<{ item_id?: string }>(req);
    const itemId = String(item_id ?? '');
    if (!UUID.test(itemId)) throw new HttpError(400, 'bad_item');
    const db = serviceClient();
    const { data: item } = await db
      .from('vault_items')
      .select('id, owner_id, kind, deleted_at')
      .eq('id', itemId)
      .maybeSingle();
    if (!item || item.owner_id !== caller.user.id || item.kind !== 'file' || item.deleted_at) {
      throw new HttpError(404, 'item_not_found');
    }
    const { data: blob } = await db
      .from('file_blobs')
      .select('id, drive_a_file_id, drive_b_file_id')
      .eq('item_id', itemId)
      .maybeSingle();
    let trashed = 0;
    if (blob) {
      const copies: { slot: Slot; id: string | null }[] = [
        { slot: 'a', id: blob.drive_a_file_id },
        { slot: 'b', id: blob.drive_b_file_id },
      ];
      for (const c of copies) {
        if (!c.id) continue;
        try {
          await trashFile(await accessToken(db, c.slot), c.id);
          trashed += 1;
        } catch (e) {
          console.error('drive-delete', c.slot, e instanceof Error ? e.message : String(e));
        }
      }
      await db.from('file_blobs').delete().eq('id', blob.id);
    }
    // The service role bypasses the version guard's purpose here: the owner asked to delete.
    const { data: current } = await db
      .from('vault_items')
      .select('version')
      .eq('id', itemId)
      .single();
    const { error } = await db
      .from('vault_items')
      .update({ deleted_at: new Date().toISOString(), version: current?.version })
      .eq('id', itemId);
    if (error) throw new HttpError(500, 'delete_failed');
    await writeAudit(db, {
      actor_id: caller.user.id,
      actor_device_id: caller.device.id,
      action: 'file.delete',
      target_user_id: caller.user.id,
      target_item_id: itemId,
      meta: { trashed_copies: trashed },
    });
    return json({ ok: true, trashed_copies: trashed });
  }),
);
