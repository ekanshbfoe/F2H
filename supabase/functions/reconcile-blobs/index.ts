/**
 * reconcile-blobs (child spec 0001-drive-redundancy, AC-12): nightly via pg_cron. Verifies each
 * `ok` and `degraded` blob's copies by `sha256Checksum`, re copies a missing copy from the good
 * one under the byte budget, marks `missing` when no copy is good, sweeps `uploading` rows older
 * than 24 h, and pushes the Admin when anything is wrong.
 *
 * Re copies hold one blob in memory, so a single blob above RECOPY_MAX_BYTES (default 64 MB) is
 * reported instead of copied; work stops near the 150 s wall clock.
 */
import { requireServiceCall } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handle, HttpError, json } from '../_shared/errors.ts';
import {
  accessToken,
  blobHex,
  downloadFile,
  findByBlob,
  getFile,
  pushAdmin,
  trashFile,
  uploadWhole,
  type Slot,
} from '../_shared/google.ts';
import { serviceClient } from '../_shared/supabase.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const WALL_MS = 120_000;

interface Report {
  checked: number;
  ok: number;
  degraded: number;
  missing: number;
  recopied: number;
  skipped_large: number;
  swept: number;
  errors: string[];
}

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    await requireServiceCall(req);
    const started = Date.now();
    const budget = Number(Deno.env.get('RECONCILE_BUDGET_BYTES') ?? 200 * 1024 * 1024);
    const recopyMax = Number(Deno.env.get('RECOPY_MAX_BYTES') ?? 64 * 1024 * 1024);
    let spent = 0;
    const db = serviceClient();
    const report: Report = {
      checked: 0,
      ok: 0,
      degraded: 0,
      missing: 0,
      recopied: 0,
      skipped_large: 0,
      swept: 0,
      errors: [],
    };

    const { data: accounts } = await db
      .from('drive_accounts')
      .select('slot, root_folder_id, status');
    const roots = new Map<Slot, string>();
    const tokens = new Map<Slot, string>();
    for (const a of accounts ?? []) {
      if (a.status !== 'active') continue;
      try {
        tokens.set(a.slot as Slot, await accessToken(db, a.slot as Slot));
        roots.set(a.slot as Slot, a.root_folder_id);
      } catch (e) {
        report.errors.push(`slot ${a.slot}: ${e instanceof Error ? e.message : 'token'}`);
      }
    }

    const { data: blobs } = await db
      .from('file_blobs')
      .select('id, owner_id, size_ct, sha256, state, drive_a_file_id, drive_b_file_id')
      .in('state', ['ok', 'degraded'])
      .order('last_verified_at', { ascending: true, nullsFirst: true })
      .limit(500);

    for (const blob of blobs ?? []) {
      if (Date.now() - started > WALL_MS) break;
      report.checked += 1;
      const hex = blobHex(String(blob.id));
      const sha = blobHex(String(blob.sha256));
      const size = Number(blob.size_ct);
      const ids: Record<Slot, string | null> = { a: blob.drive_a_file_id, b: blob.drive_b_file_id };
      const good: Record<Slot, boolean> = { a: false, b: false };
      for (const slot of ['a', 'b'] as const) {
        const token = tokens.get(slot);
        const id = ids[slot];
        if (!token || !id) continue;
        try {
          const f = await getFile(token, id);
          good[slot] = Boolean(f && !f.trashed && f.size === size && f.sha256 === sha);
        } catch (e) {
          report.errors.push(`${hex} ${slot}: ${e instanceof Error ? e.message : 'get'}`);
        }
      }
      // One good copy and a reachable other Drive: copy it across while the budget lasts.
      for (const [from, to] of [
        ['a', 'b'],
        ['b', 'a'],
      ] as const) {
        if (!good[from] || good[to] || !tokens.get(to) || !roots.get(to)) continue;
        if (size > recopyMax || spent + size > budget) {
          report.skipped_large += 1;
          continue;
        }
        try {
          const res = await downloadFile(tokens.get(from)!, ids[from]!);
          if (!res.ok) throw new Error(`download ${res.status}`);
          const bytes = new Uint8Array(await res.arrayBuffer());
          const newId = await uploadWhole(
            tokens.get(to)!,
            {
              name: `${hex}.bin`,
              parent: roots.get(to)!,
              appProperties: { owner: blob.owner_id, blob_id: hex },
            },
            bytes,
          );
          spent += size;
          ids[to] = newId;
          good[to] = true;
          report.recopied += 1;
        } catch (e) {
          report.errors.push(
            `${hex} copy ${from}->${to}: ${e instanceof Error ? e.message : 'copy'}`,
          );
        }
      }
      const state = good.a && good.b ? 'ok' : good.a || good.b ? 'degraded' : 'missing';
      report[state] += 1;
      await db
        .from('file_blobs')
        .update({
          state,
          drive_a_file_id: good.a ? ids.a : null,
          drive_b_file_id: good.b ? ids.b : null,
          last_verified_at: new Date().toISOString(),
        })
        .eq('id', blob.id);
    }

    // Abandoned uploads: the phone never called complete within a day.
    const { data: stale } = await db
      .from('file_blobs')
      .select('id')
      .eq('state', 'uploading')
      .lt('created_at', new Date(Date.now() - DAY_MS).toISOString())
      .limit(200);
    for (const s of stale ?? []) {
      const hex = blobHex(String(s.id));
      for (const [slot, token] of tokens) {
        try {
          for (const f of await findByBlob(token, hex)) await trashFile(token, f.id);
        } catch (e) {
          report.errors.push(`sweep ${hex} ${slot}: ${e instanceof Error ? e.message : 'sweep'}`);
        }
      }
      await db.from('file_blobs').delete().eq('id', s.id);
      report.swept += 1;
    }

    if (report.missing > 0 || report.degraded > 0 || report.errors.length > 0) {
      await pushAdmin(
        db,
        'Drive check found problems',
        `${report.missing} missing, ${report.degraded} with one copy, ${report.errors.length} errors. Open F2H → Google Drives.`,
      );
    }
    await writeAudit(db, {
      action: 'drive.reconcile',
      meta: { ...report, errors: report.errors.slice(0, 20) },
    });
    return json(report);
  }),
);
