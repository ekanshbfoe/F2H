/**
 * backup-metadata (spec 0006, AC-1 to AC-4): nightly via pg_cron (service key) or "Back up now"
 * by the Admin. Dumps the tables, seals the JSON to the family recovery public key, uploads the
 * sealed file to the `backups` folder of every active Drive, checks it by hash, records a
 * `backups` row and prunes snapshots older than 30 days. Nothing is ever stored unsealed.
 */
import { requireAdmin, requireServiceCall } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { dumpTables, fileNameFor, rowsToPrune } from '../_shared/backup.ts';
import { byteaToBytes } from '../_shared/challenge.ts';
import { handle, HttpError, json } from '../_shared/errors.ts';
import {
  accessToken,
  findChildFolder,
  getFile,
  pushAdmin,
  trashFile,
  uploadWhole,
  type Slot,
} from '../_shared/google.ts';
import { seal, sha256Hex } from '../_shared/sealed-box.ts';
import { serviceClient } from '../_shared/supabase.ts';

async function authorize(req: Request): Promise<string | null> {
  try {
    await requireServiceCall(req);
    return null;
  } catch {
    const admin = await requireAdmin(req);
    return admin.user.id;
  }
}

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const actor = await authorize(req);
    const db = serviceClient();
    const now = new Date();

    const { data: config } = await db
      .from('family_config')
      .select('admin_recovery_pubkey')
      .eq('id', 1)
      .maybeSingle();
    if (!config?.admin_recovery_pubkey) throw new HttpError(503, 'recovery_not_published');
    const recipient = byteaToBytes(String(config.admin_recovery_pubkey));

    // Build and seal in memory; the plaintext bytes are zeroed as soon as the box exists.
    const snapshot = await dumpTables(db, now);
    const plain = new TextEncoder().encode(JSON.stringify(snapshot));
    const sealed = seal(recipient, plain);
    plain.fill(0);
    const hash = sha256Hex(sealed);
    const name = fileNameFor(now);

    // Service key dry run (verification): prove the dump and seal without uploading anything.
    const body = (await req.json().catch(() => ({}))) as { dry_run?: boolean };
    if (body.dry_run === true && actor === null) {
      const counts = Object.fromEntries(
        Object.entries(snapshot.tables).map(([t, rows]) => [t, rows.length]),
      );
      return json({
        dry_run: true,
        size: sealed.length,
        sha256: hash,
        auth_users: snapshot.auth.users.length,
        counts,
      });
    }

    const { data: accounts } = await db
      .from('drive_accounts')
      .select('slot, root_folder_id')
      .eq('status', 'active');
    if (!accounts || accounts.length === 0) throw new HttpError(503, 'no_drive_linked');

    const ids: Record<Slot, string | null> = { a: null, b: null };
    const errors: string[] = [];
    for (const account of accounts) {
      const slot = account.slot as Slot;
      try {
        const token = await accessToken(db, slot);
        const folder =
          (await findChildFolder(token, account.root_folder_id, 'backups')) ??
          account.root_folder_id;
        const id = await uploadWhole(
          token,
          {
            name,
            parent: folder,
            appProperties: { kind: 'backup', date: now.toISOString().slice(0, 10) },
          },
          sealed,
        );
        const f = await getFile(token, id);
        if (!f || f.sha256 !== hash || f.size !== sealed.length)
          throw new Error('hash check failed');
        ids[slot] = id;
      } catch (e) {
        errors.push(`${slot}: ${e instanceof Error ? e.message : 'upload'}`);
      }
    }
    const state = ids.a && ids.b ? 'ok' : ids.a || ids.b ? 'degraded' : 'failed';

    // Replace today's earlier snapshot and drop anything older than 30 days.
    const { data: old } = await db
      .from('backups')
      .select('id, taken_at, drive_a_file_id, drive_b_file_id');
    const pruneIds = new Set(rowsToPrune((old ?? []) as { id: string; taken_at: string }[], now));
    for (const row of old ?? []) {
      if (!pruneIds.has(row.id) || state === 'failed') continue;
      for (const [slot, fileId] of [
        ['a', row.drive_a_file_id],
        ['b', row.drive_b_file_id],
      ] as const) {
        if (!fileId) continue;
        try {
          await trashFile(await accessToken(db, slot), fileId);
        } catch {
          // a stray old file costs a few KB; the next run tries again
        }
      }
      await db.from('backups').delete().eq('id', row.id);
    }

    const backupId = crypto.randomUUID();
    await db.from('backups').insert({
      id: backupId,
      taken_at: now.toISOString(),
      drive_a_file_id: ids.a,
      drive_b_file_id: ids.b,
      size: sealed.length,
      sha256: `\\x${hash}`,
      state,
    });
    await writeAudit(db, {
      actor_id: actor,
      action: 'backup.snapshot',
      meta: { state, size: sealed.length, errors: errors.slice(0, 5) },
    });
    if (state !== 'ok') {
      await pushAdmin(
        db,
        state === 'failed' ? 'Backup failed' : 'Backup saved on one Drive only',
        `Tonight's encrypted backup ${state === 'failed' ? 'reached no Drive' : 'reached one Drive'}. Open F2H → Backups.`,
      );
    }
    return json({ backup_id: backupId, state, size: sealed.length, drives: ids, errors });
  }),
);
