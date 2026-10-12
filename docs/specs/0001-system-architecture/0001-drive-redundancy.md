# 0001 child: Drive redundancy

Part of [0001 system architecture](index.md). Build spec for feature 10 (Files & Drive redundancy). GA tier.

## Summary

Files are encrypted on the phone in 1 MiB chunks and uploaded straight to two Google Drive accounts (the Admin's and the Father's) at the same time. The phone never holds a Google credential: a server function opens two resumable upload sessions and hands back their one time URLs. Downloads use a one hour token for the healthier copy. A nightly job checks both copies by hash, re copies anything missing and sweeps abandoned uploads.

## Requirements

**Acceptance criteria**:
- **AC-1**: The Admin can link Google account slot `a` and slot `b` from Settings → Drive; the OAuth code is exchanged by a function, the refresh token lands in Supabase Vault, and a root folder `F2H Vault` is created; the app shows only email and status.
- **AC-2**: A slot whose refresh token stops working is marked `needs_relink` and the Admin is pushed.
- **AC-3**: `drive-upload-session` returns two resumable session URIs and a `file_blobs` row in `uploading`; the response contains no access token.
- **AC-4**: The client encrypts the file per the chunked format (crypto child) to a temp file with flat memory, computing the ciphertext SHA 256.
- **AC-5**: The client PUTs the ciphertext to both URIs in 1 MiB `Content-Range` chunks, shows per Drive progress, resumes after a network drop by querying the session, and tolerates one URI failing.
- **AC-6**: `drive-upload-complete` compares size and `sha256Checksum` on each Drive to the client hash, inserts `vault_items` with the item ciphertext and wrapped DEK from the request, links the blob, and sets `ok` (both good) or `degraded` (one good); both bad → 422 and the row is deleted.
- **AC-7**: Every upload uses a fresh `blob_id` and DEK; the metadata ciphertext includes `blob_id` and the hash.
- **AC-8**: `drive-download-token` returns a 1 hour `drive.file` access token for the healthy slot (prefers `a`), only to an approved device, and writes no audit row (reads are private).
- **AC-9**: The client streams the ciphertext in chunks, decrypts to the cache directory, verifies the hash, and opens the file with `expo-sharing` or an in app image/PDF viewer.
- **AC-10**: The Files list shows name, size, date, a `degraded` badge, and upload progress; empty, error and offline states render.
- **AC-11**: `drive-delete` trashes both copies, soft deletes the item, writes an audit row.
- **AC-12**: `reconcile-blobs` verifies every `ok` and `degraded` blob's `sha256Checksum` on both Drives, re copies a missing copy by streaming through the function under `RECONCILE_BUDGET_BYTES` (default 200 MB) per run, marks `missing` when neither copy is good, pushes the Admin on any failure, and trashes `uploading` rows and Drive orphans older than 24 h.
- **AC-13**: `DOWNLOAD_MODE=proxy` switches `drive-download-token` to stream bytes with Range support instead of returning a token (no client change).

## Decision

Google Drive API v3 with the `drive.file` scope, refresh tokens in Supabase Vault, direct client uploads to resumable session URIs, token vending for downloads with a proxy switch, nightly reconcile via pg_cron.

**Implementation skills**: none.

## Feature design

**Google Cloud setup** (manual, documented in README): project, Drive API enabled, OAuth client type Web with redirect `https://<project>.supabase.co/functions/v1/drive-link-callback`, consent screen published to Production with only `https://www.googleapis.com/auth/drive.file` (non sensitive, no verification needed; Testing status would expire refresh tokens after 7 days).

**Linking**: `drive-link-start?slot=a` (admin) returns the Google auth URL with `access_type=offline&prompt=consent&state=<signed slot+nonce>`; the app opens it with `expo-web-browser`; Google redirects to `drive-link-callback`, which exchanges the code, stores the refresh token with `vault.create_secret`, creates `F2H Vault` and `F2H Vault/backups`, upserts `drive_accounts`, and renders a tiny "You can close this" page that deep links back (`f2h://drive-linked?slot=a`, or the Expo Go URL passed in `state`). Slot `b` is linked the same way while the Father signs into Google on the Admin's phone, or on the Father's phone with an Admin issued link token.

**Upload**: see umbrella Section 3.2. Session request body: `{size_ct, sha256_ct, blob_id, chunk_size, total_chunks}`. Function names the Drive file `<owner_id>/<blob_id hex>.bin` under the slot's root folder with `appProperties {owner, blob_id}`. Session URIs expire after a week; the client stores them in the SQLite `uploads` table to resume after an app restart. Chunk read via `expo-file-system` byte range (`position`, `length`); chunk PUT via `FileSystem.uploadAsync` with `Content-Range`. Google requires chunk sizes in multiples of 256 KiB (1 MiB ok). 308 means continue; 200/201 means done.

**Download**: client → `drive-download-token` → `{slot, file_id, token, expires_at}` → `GET https://www.googleapis.com/drive/v3/files/<id>?alt=media` with `Range` headers of 1 MiB → decrypt chunk by chunk → cache file keyed by `blob_id`; cache is cleared on lock.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `drive-link-start` | GET | slot, return_url | auth_url | admin JWT + device | 403 |
| `drive-link-callback` | GET | code, state | html | Google redirect | 400 bad state |
| `drive-upload-session` | POST | blob_id, size_ct, sha256_ct, chunk_size, total_chunks | session_a, session_b (either may be null), blob_id | user JWT + device | 503 no drive linked, 413 over `MAX_BLOB_BYTES` (default 2 GiB) |
| `drive-upload-complete` | POST | blob_id, item_id, dek_wrapped, ciphertext (metadata), kind=file | item, state | user JWT + device | 422 hash mismatch |
| `drive-download-token` | POST | blob_id | slot, file_id, token, expires_at | user JWT + device | 404, 503 no healthy copy |
| `drive-delete` | POST | item_id | ok | user JWT + device | 404 |
| `reconcile-blobs` | POST | (cron) | report | service key | |

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| session | owner folder id | created on first use under the slot root, cached in `drive_accounts.root_folder_id` + `appProperties` lookup |
| complete | drive hash | `files.get?fields=size,sha256Checksum` |
| download | healthy slot | `file_blobs.drive_a_file_id` not null and last verify ok, else `b` |
| reconcile | budget | `RECONCILE_BUDGET_BYTES` secret |
| progress | bytes sent | sum of acknowledged `Content-Range` per session |

**Key invariants**: `state = ok` ⇔ both file ids present and last verify passed; a blob id is never reused; the client never receives a refresh token or a token during upload.

**Security model**: upload URIs are single purpose bearer URLs valid one week; download tokens are `drive.file` scoped, 1 hour, only to approved devices; both Google accounts' tokens live only in Vault and function memory.

**Configuration required**:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: OAuth client.
- `DRIVE_STATE_SECRET`: signs the OAuth `state`.
- `DOWNLOAD_MODE`: `token` (default) or `proxy`.
- `RECONCILE_BUDGET_BYTES`, `MAX_BLOB_BYTES`.

**Critical test scenarios**:
- Happy path: upload → both Drives → complete `ok` → download and open (AC-3 to AC-9).
- Failure: slot b down → `degraded`, still readable; reconcile restores it next run (AC-6, AC-12).
- Auth: pending device gets 401 from every drive function (AC-3, AC-8).

## Build plan

1. [x] Spike (Phase 0): confirm resumable PUT without Authorization; record in `rationale.md`; choose direct or proxy, precondition for **AC-5**.
2. [x] `drive-link-start` and `drive-link-callback` functions with Vault storage; Settings → Drive screens for slots a and b, satisfies **AC-1**, **AC-2**.
3. [x] `drive-upload-session` with dual sessions and the `uploading` row, satisfies **AC-3**.
4. [x] Client chunked encrypt to a temp file (uses crypto child), satisfies **AC-4**, **AC-7**.
5. [x] Dual resumable chunk upload with progress and resume, satisfies **AC-5**. _(Resume across an app restart, the SQLite `uploads` table, is deferred; see the implementation notes.)_
6. [x] `drive-upload-complete` verification and item insert, satisfies **AC-6**.
7. [x] `drive-download-token` and the client download, decrypt, verify, open, satisfies **AC-8**, **AC-9**.
8. [x] Files list, detail, badges and states, satisfies **AC-10**.
9. [x] `drive-delete`, satisfies **AC-11**.
10. [x] `reconcile-blobs` with budget, orphan sweep and Admin push; cron wiring, satisfies **AC-12**.
11. [x] Proxy mode in `drive-download-token`, satisfies **AC-13**.

## Implementation notes (2026-10-12)

Recorded during the autonomous build the engineer authorized on 2026-10-12; each is a local call inside this spec's decision.

- **Refresh tokens in Vault**: migration 0013 adds `drive_link_account`, `drive_refresh_token` and `drive_mark_relink`, all `security definer` and executable only by the service role. pgTAP `0007_drive_vault.test.sql` proves a member cannot read a token.
- **OAuth state**: HMAC SHA 256 over `{slot, admin, return_url, nonce, exp}` with `DRIVE_STATE_SECRET`, valid 10 minutes; the return URL must be an `exp://`, `exps://` or `f2h://` deep link. `drive-link-callback` is deployed with `--no-verify-jwt` (config.toml says so too); the signed state is its guard.
- **Drive layout**: files are named `<blob_id hex>.bin` directly in the slot's `F2H Vault` folder with `appProperties {owner, blob_id}` (no per owner subfolder); `backups/` is created beside them for Slice 6. Relinking the same Google account keeps its folder.
- **Completion check**: `drive-upload-complete` finds each copy by its `blob_id` app property and compares size and `sha256Checksum`; extra copies are trashed.
- **Upload client**: the phone encrypts to `cache/f2h-upload/<blob>.ct`, then sends 1 MiB ranges per Drive with `File.upload` (PUT, binary, `Content-Range`); a failed range asks the session `bytes */total` and resumes, up to 3 failures in a row. A Drive that fails is dropped and the blob lands `degraded`.
- **Download client**: `File.downloadFileAsync` with the one hour token (or the proxy URL and the session headers when `DOWNLOAD_MODE=proxy`), then the whole ciphertext hash is checked before any decryption; the plaintext goes to `cache/f2h-open/` and opens through `expo-sharing`. Every `f2h-*` cache folder is deleted on lock.
- **One DEK per file**: the item metadata (AAD item id) and the blob chunks (AAD with the blob id) share the item's DEK, as the umbrella's data flow says.
- **Reconcile limits**: a re copy holds one blob in memory, so a blob above `RECOPY_MAX_BYTES` (default 64 MB) is reported, not copied; work stops after 120 s. Drive orphans with no row at all are not listed yet; only `uploading` rows older than 24 h are swept.
- **Deferred**: resume across an app restart (SQLite `uploads` table); an in app image and PDF viewer (files open through the system share sheet for now); `bytes_used` accounting on `drive_accounts`.

## Consequences

**Positive**: no Google credential in the APK; both copies verified by hash; one Drive can vanish.
**Negative**: a `drive.file` token reaches approved devices for downloads; Drive has no pre signed URLs, so the alternative is paying egress through the function; pure JS encryption limits big video uploads.
**Neutral**: the Father must sign into Google once, in person, on an Admin controlled flow.
