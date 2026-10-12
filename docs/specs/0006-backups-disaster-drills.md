# 0006. Backups and disaster drills

**Status**: In Progress
**Date**: 2026-10-12
**Mode**: FEATURE · GA tier · Tracer Bullet
**Decided by**: Claude during the autonomous run the engineer authorized on 2026-10-12. Every call below is a recommendation the engineer may overturn.

## Summary

Every night the `backup-metadata` function dumps the database tables the umbrella's backup schema names into one JSON document, seals it to the family recovery public key with the same sealed box the app uses, and uploads it to the `backups` folder of both Drives. Only the holder of the 24 word paper kit can open a snapshot. The Admin sees the last 30 days of snapshots on a Backups screen and can run one now. A local script plus a runbook restore a working vault from either Drive alone. Combined with the encrypted blobs already on both Drives, one surviving Drive and the paper kit are enough to rebuild everything.

## Requirements

**Acceptance criteria**:
- **AC-1**: `backup-metadata` (cron 03:00 UTC, already scheduled; or the Admin's "Back up now") builds `{schema: 1, taken_at, tables: {...}}` from `family_config`, `allowed_members`, `profiles`, `key_material`, `devices` (without `token_hash` and `registration_nonce`), `vault_items` (including soft deleted rows), `file_blobs`, `drive_accounts` (without `vault_secret_id`), `recovery_grants`, `audit_log` and `backups`.
- **AC-2**: The document is sealed to `family_config.admin_recovery_pubkey` with the umbrella sealed box (`0x01 || eph_pub || nonce || ct`, HKDF info `f2h:sealed-box:v1`); the app's `box.open` with the recovery secret opens it (shared vector test).
- **AC-3**: The sealed file `f2h-backup-<yyyy-mm-dd>.bin` is uploaded to the `backups` folder of every active Drive and checked by `sha256Checksum`; a `backups` row records both file ids, size, hash and `ok` (both), `degraded` (one) or `failed` (none). A failure pushes the Admin.
- **AC-4**: Snapshots older than 30 days are trashed on both Drives and their rows removed; at most one snapshot per day (a second run the same day replaces it).
- **AC-5**: Home → Admin → Backups lists the snapshots newest first with date, size and per Drive status, and a "Back up now" button for the Admin; members never see the screen.
- **AC-6**: `npm run restore:backup -- <file.bin>` asks for the 24 words, rebuilds the recovery key, refuses a key whose fingerprint differs from the snapshot's `family_config`, opens the snapshot and writes `restore.sql` (inserts in dependency order) plus a summary; the runbook in `docs/runbooks/restore.md` walks a fresh Supabase project through migrations, `restore.sql`, the Vault secrets, Drive relinking and the Admin's first login.
- **AC-7**: Jest covers the server sealed box against the app's `box.open`, the table filter (no token hashes, no Vault ids), the pruning choice, and the restore script's SQL builder; pgTAP covers the `backups` row policy (Admin read only).

## Decision

A nightly service role function seals a JSON dump to the recovery public key and stores it beside the blobs on both Drives; restoring is an offline script driven by the paper kit, documented in a runbook.

**Implementation skills**: none.

**Calls made here (recommended items):**
- **Seal the whole document, not per table.** One sealed box, one file, one hash; the snapshot is a few MB for a family.
- **Leave out token hashes, nonces and Vault ids.** A restored project issues new device tokens (every phone registers again) and new Vault secrets (Drives are relinked), so these are useless at best and a risk at worst.
- **Keep soft deleted vault rows.** The snapshot is the only place an accidental delete can come back from.
- **One snapshot per day, 30 days.** Matches the umbrella; the file name carries the date so a rerun the same day replaces it.
- **Restore writes SQL, it does not touch a database.** The engineer runs it with the CLI against the project they choose; a script that writes into a live project by itself is too easy to aim at the wrong one.
- **"Back up now" goes through the same function** with an Admin JWT in addition to the cron's service key.

## Feature design

**API surface**:
| Endpoint | Method | Auth | Output | Errors |
|---|---|---|---|---|
| `functions/v1/backup-metadata` | POST | service key (cron) or `requireAdmin` | `{ backup_id, state, size, drives }` | 503 `no_drive_linked`, 503 `recovery_not_published`, 500 `upload_failed` |

**Value sourcing**:
| Value | Source |
|---|---|
| tables | service role selects, columns filtered per AC-1 |
| recipient key | `family_config.admin_recovery_pubkey` |
| backups folder | the `backups` folder created at link time under the slot root, found by name and parent |
| file name | `f2h-backup-` + the UTC date of `taken_at` |
| prune set | `backups.taken_at` older than 30 days |
| restore key | `mnemonic.toSeed(words)` → `recovery.deriveRecoveryKeypair` |
| restore check | `recovery.fingerprint(public key)` equals the snapshot's `family_config.recovery_fingerprint` |

**Key invariants**: a snapshot is never written in plaintext anywhere (built and sealed in function memory); the recovery secret never leaves the machine running the restore; the snapshot never contains a device token hash or a Vault secret id.

**Security model**: the function runs with the service role and is callable only by the cron (service key) or the Admin on an approved phone. Google sees one opaque file per day per Drive.

## Build plan

1. [x] `_shared/sealed-box.ts` (Deno, same construction) with a vector test against the app's `box.open`; `_shared/backup.ts` (table dump and filter, prune choice); jest, satisfies **AC-1**, **AC-2**, **AC-7**.
2. [x] `backup-metadata` function: dump, seal, upload to both `backups` folders, verify, record, prune, push on failure; deploy and run once, satisfies **AC-1**, **AC-3**, **AC-4**.
3. [x] Backups screen with "Back up now"; Home link; pgTAP `0009_backups.test.sql`, satisfies **AC-5**, **AC-7**.
4. [x] `scripts/restore-backup.ts` with the SQL builder and its jest test; `docs/runbooks/restore.md` (also records the 2026-10-08 manual `decide_device` break glass), satisfies **AC-6**, **AC-7**.

## Implementation notes (2026-10-12)

- **Auth rows in the snapshot**: a restored project needs `auth.users` and `auth.identities` for the family to keep their passwords, and PostgREST cannot read the `auth` schema, so migration 0014 adds `backup_auth_rows()` (service role only). `encrypted_password` is a bcrypt of the derived auth secret, never the password; the snapshot is sealed. pgTAP `0009_backups.test.sql` proves a member cannot call it.
- **Dry run**: a service key call with `{"dry_run": true}` dumps and seals in memory and returns only counts, size and hash (used to verify the live dump on 2026-10-12: 2 auth users, 11 tables, 14 KB sealed). Nothing is uploaded.
- **Restore SQL**: loads with `session_replication_role = replica` (no webhook pushes, no audit triggers), restores every phone as `revoked` with a placeholder token and no push token, skips `drive_accounts`, and resets the audit sequence.
- **Not yet proven**: the full drill against a fresh project (needs a second Supabase project or Docker); queued in `verify.md`.

## Consequences

**Positive**: one surviving Drive plus the paper kit rebuild the family vault; Google holds only ciphertext.
**Negative**: a restore asks every phone to register again and the Admin to relink both Drives; the drill against a fresh project needs a second Supabase project or Docker, which this machine lacks today.
**Neutral**: about one small file per Drive per day.

## Follow-up

- [ ] Run the drill end to end against a fresh Supabase project (or a local Docker stack) and tick it in `verify.md`.
- [ ] Consider streaming the dump if the vault ever grows past a few tens of MB.

## Rationale

**Context**: the umbrella fixed the daily sealed snapshot, both Drives, 30 days and the restore runbook (Sections 6 and 7). Open were the table filter, the trigger for a manual run, pruning and the restore tool's shape.

**Options considered**:
1. Sealed JSON on both Drives plus an offline restore script (chosen).
2. Supabase's own backups. Rejected: not on the free tier, and they would sit with the same provider whose loss we are guarding against.
3. A restore function inside the new project. Rejected: it would need the recovery secret on a server.

**Rationale**: option 1 keeps the recovery secret on paper and on the Admin's machine only, and survives the loss of Supabase or of either Google account.
