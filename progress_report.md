# F2H progress report

Written during the autonomous run you started on 2026-10-12. Newest feature at the bottom. Each entry says what landed, what is waiting for your phone, and anything I decided on your behalf.

## Slice 1 closed (2026-10-12)

- **Admin device self approval (feature 15): done.** The database confirms your phone run. Row `cb431f6f…` is approved, decided by you, with 1 challenge, 0 misses, cleared challenge columns and a `device.self_approve` audit row.
  - Skipped at close, recorded in the scope: steps that need a second Admin phone, a member phone or a forced wrong tag. Also the fresh model review and the docs.
  - I recommend running `/check review admin device self approval` before release, because it is security code.
- **App lock (feature 7): done.** Spec 0002 is now `Accepted`.
  - Skipped at close: the LAVA unlock time in milliseconds and the revoked phone 403 check.
- **New screen: Home → Admin → Show my recovery kit.** It shows your 24 words, but only while the app is unlocked.

## Contacts vault (feature 8): built, closing checks open

**What landed** (5 commits on `main`, pushed):

- **Spec 0003** (`docs/specs/0003-contacts-vault.md`).
- **Data layer.** Each contact is one encrypted `vault_items` row of kind `contact`, with a fresh data key on every write.
  - There is no migration and no Edge Function. The existing owner-only access rules on `vault_items`, the version guard and the encryption scheme already cover contacts.
- **Screens.** Contacts opens from Home ("Your vault" card):
  - Call and WhatsApp tabs with counts, search by name or by 3 or more digits, and pull to refresh.
  - A detail screen with Call (`tel:`) and Open in WhatsApp (`https://wa.me/`).
  - Add and edit with up to 5 numbers, labels and a note, and delete with a confirm.
  - Loading, empty, no results and error states.
- **Import from the phone.**
  - It asks for permission, and "Open settings" appears if you deny permanently.
  - It reads in pages of 200, up to 2000 contacts, and skips entries without a number.
  - Numbers already in your vault show as "Already in your vault".
  - The Call and WhatsApp tags apply to the whole import, there is a select all, and saving runs in batches of 50 with progress.
- **Tests.**
  - The database test file has 12 checks, all green on the hosted project. It covers isolation between members, pending phones, a foreign device token, the version guard and soft delete.
  - Jest: 5 suites, 45 tests. The full suite is green: 49 suites, 283 tests. Typecheck and lint are clean.

**Waiting for your phone:** 14 steps in `docs/specs/0001-system-architecture/verify.md`, under "Verify: contacts vault". Then run `/check verify contacts vault` and I tick what passes.

**Decisions I made for you** (each is in the spec with its runner up, and all are easy to change):

- **Default country code +91.** A bare 10 digit mobile becomes `+91…`. A number without a country code can still be called, but the WhatsApp button explains why it is disabled. The setting is the `DEFAULT_CALLING_CODE` constant in `src/features/contacts/model.ts`.
- **WhatsApp opens `https://wa.me/<digits>`** rather than `whatsapp://`. It works without WhatsApp installed and needs no Android manifest entry.
- **The decrypted list is held in a small Zustand store, not TanStack Query.** There is no new dependency on the 1 GB phone, and the lock clears it.
- **Search and duplicate checks run on the phone.** No searchable index is stored on the server, so nothing about names or numbers leaks.
- **Delete is a soft delete.** It sets `deleted_at`, and the row stays.

**Things to know:**

- **Typed routes.** Two Expo dev servers from your own session (`expo start -c`) were still running, and I left them alone. They write a slightly different typed route list than a fresh server does. The contacts links therefore go through `src/features/contacts/routes.ts`, so typecheck passes either way.
- **`npx expo-doctor` reports `newArchEnabled` in `app.json` as a schema error.** This was there before my changes. I left it, since removing it changes native config.
- **`expo-contacts` was added** (SDK 57, included in Expo Go), with its config plugin text for the iOS prompt.

## Fix found on the way: screenshot block (2026-10-12)

- **The bug.** Leaving the recovery words screen or Show my recovery kit released the app wide screenshot block. They shared its key, `f2h`.
- **The fix.** Each screen now holds its own key (`e7c4efb`), and a jest test proves the app wide hold survives.
- **What you will see.** A screenshot after visiting those screens was possible before this fix and should now be blocked.

## Credential vault (feature 9): built, closing checks open

**What landed** (5 commits on `main`, pushed):

- **Spec 0004** (`docs/specs/0004-credential-vault.md`).
- **Shared vault items module** (`src/features/vault/items.ts`). Contacts now uses it too, with every contacts test still green.
- **Credentials as encrypted `vault_items`** of kind `credential`. Each one holds:
  - a type (Bank, Email, Other), a title, a username, a password and a website (`https://` only);
  - up to 8 extra fields, each optionally secret;
  - a note.
  - A new Bank item starts with "Customer ID" and "Account number".
- **Screens.**
  - A list grouped into Bank, Email and Other, with search over the title, username and website host. Passwords and secret fields are never searched.
  - A detail screen with secrets masked as 8 dots. Reveal lasts 30 seconds and masks again when you leave.
  - Copy goes through a 30 second clipboard timer. It clears only if the clipboard still holds the copied value, and a lock clears it at once.
  - A form with a password generator: 12 to 64 characters, the four character sets, unbiased sampling and a strength badge.
- **Tests.** The database test file for credentials has 12 checks, all green on the hosted project. The full jest suite is green: 54 suites, 318 tests. Typecheck and lint are clean.

**Waiting for your phone:** 15 steps in `docs/specs/0001-system-architecture/verify.md`, under "Verify: credential vault".

**Decisions I made for you** (all in the spec):

- **Fixed 8 dot mask.** It never shows the real length.
- **30 second reveal and clipboard windows.**
- **Search covers the host only,** never the URL path, which can carry tokens.
- **No passphrase mode yet.**
- **Limit: Expo Go cannot mark copied text as sensitive.** Android 13 and later may show it in the clipboard preview until it clears. This is a follow up for an EAS build.

## Files & Drive redundancy (feature 10): built, closing checks open

**Do this first, before any Drive test** (in the Google Cloud console, I cannot do it from here):

1. **Register the redirect URI** on the OAuth client: `https://abkjryjrwvnutwmzbkex.supabase.co/functions/v1/drive-link-callback`.
2. **Enable the Drive API** for the project.
3. **Publish the consent screen to Production**, asking only for the `drive.file` scope. In Testing status, Google drops the link after 7 days.

**What landed** (4 commits on `main`, pushed):

- **Migration 0013 (live).** Each Drive's refresh token lives only in Supabase Vault, behind service role only functions. The database test has 9 checks, all green on the hosted project, and proves a member cannot read a token.
- **Seven Edge Functions, deployed and smoke tested.**
  - `drive-link-start` and `drive-link-callback`: Google sign in with a signed `state`, then the token goes to Vault and an `F2H Vault` folder is created.
  - `drive-upload-session`: two resumable sessions, and no token ever reaches the phone.
  - `drive-upload-complete`: size and SHA 256 are checked on each Drive, giving `ok` or `degraded`.
  - `drive-download-token`: a one hour token, or proxy mode.
  - `drive-delete`: both copies go to the Drive trash.
  - `reconcile-blobs`: verify both copies, re copy a missing one, sweep abandoned uploads and push the Admin.
- **Phone side.**
  - Files opens from Home: a list with "One copy" badges, live upload progress per Drive, and a detail screen with Open and Delete.
  - Encryption runs 1 MiB at a time on the phone. The upload resumes after a dropped chunk, and a download is refused if its hash differs.
  - Decrypted copies are deleted on lock.
  - Admin → Google Drives links slot A and slot B.
- **Tests.** The full jest suite is green: 57 suites, 339 tests. They include the real upload protocol with encryption, resume, one Drive failing and a tampered download.

**Server configuration I changed** (all reversible, all what the README already asks for):

- **Function secrets set:** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (from `supabase/.env`), and a newly generated `DRIVE_STATE_SECRET`.
- **Vault secrets stored:** `project_url` and `service_role_key`. This is README step 4, which had not been done. Before this, none of the cron jobs or the approval webhook could reach the functions. I proved the path once by calling reconcile from the database, and it answered 200. This also means:
  - **the hourly expiry sweep now runs**, so pending phones older than 24 hours become expired and expired invite codes are voided;
  - **the approval push webhook now fires.**
  - If you would rather not have these yet, delete the two secrets in the dashboard under Vault.

**Waiting for you:** the Google console steps above, then the phone and dashboard steps in `verify.md` under "Verify: files & drive redundancy".

**Deferred, recorded in the spec's implementation notes:**

- **Upload resume after the app restarts.** It resumes within a session only.
- **An in app image and PDF viewer.** Files open through the system share sheet for now.
- **`bytes_used` accounting** for each Drive.
- **Sweeping Drive orphans that have no database row.**
- **Re copying a single blob above 64 MB.** These are reported, not copied.

## Admin oversight & audit (feature 11): built, closing checks open

**What landed** (5 commits on `main`, pushed):

- **Spec 0005.**
- **Read only oversight.**
  - **The flow.** Members → a member → "Open vault (logged)" asks for a confirm first. The `oversight-open` function then writes the audit row before it returns anything, and pushes the member. The Admin phone unseals the member's key with the recovery key and checks the verifier. A tampered wrap decrypts nothing.
  - **What you see.** Contacts, credentials (masked until Reveal) and file names, all read only.
  - **When it closes.** The decrypted vault is dropped when you leave the screen and on lock.
- **Activity** (Home → Account → Activity). It shows the newest 100 audit events in plain words. A member sees rows about themselves, including every oversight open, marked "About you". The Admin sees the whole family.
- **Sign out a member's phone** from Members, through the existing `admin_revoke_device`. Your own current phone has no such button.
- **Offline, read only.**
  - Contacts, Credentials and Files keep a SQLite copy of the ciphertext they last loaded. It is never plaintext.
  - When a load fails, they show that copy with a banner, and add, import, edit and delete are disabled.
  - The copy is erased on sign out and on every wipe.
- **Tests.**
  - The audit visibility database test has 6 checks, all green on the hosted project. It covers a member seeing only their own rows, being unable to write or delete the log, and the Admin seeing everything.
  - The full jest suite is green: 58 suites, 349 tests.

**Waiting for your phone:** 9 steps in `verify.md` under "Verify: admin oversight & audit". They need the Admin phone and one member phone.

**Not included:** opening a member's actual file contents during oversight. Only names and sizes show. Adding it needs a second audited download path, and the spec records it as a follow up.

## Backups & disaster drills (feature 12): built, closing checks open

**What landed** (5 commits on `main`, pushed):

- **Spec 0006**, and **migration 0014 (live).** The migration lets the backup carry the `auth.users` and `auth.identities` rows. With them, a restored project keeps everyone's existing password. Only the service role can read them.
- **`backup-metadata`, deployed** for the nightly 03:00 UTC cron and the Admin's "Back up now".
  - **What goes in.** It dumps every table and drops device token hashes, registration nonces and Vault ids.
  - **Sealing.** It seals the dump to the paper kit's public key with the same sealed box the app uses. A jest test opens a server sealed box with the app's own code.
  - **Where it goes.** It uploads to `F2H Vault/backups` on both Drives, checks each upload by hash, records it, keeps 30 days and one snapshot per day, and pushes you on a failure.
  - **Proven live.** A dry run against the hosted database dumped 2 auth users and all 11 tables, sealed to 14 KB, and uploaded nothing.
- **Backups screen** under Home → Admin → Backups, with Back up now.
- **`npm run restore:backup -- <file.bin>`.**
  - It asks for your 24 words and refuses a kit whose fingerprint does not match the snapshot.
  - It writes `restore.sql`: everyone keeps their password, old phones come back revoked, and Drive links are left out.
- **`docs/runbooks/restore.md`**: a full restore onto a fresh Supabase project. It also records the 2026-10-08 SQL break glass.
- **Tests.** The backups access database test has 5 checks, all green on the hosted project. The full jest suite is green: 61 suites, 362 tests.

**Waiting for you:** link the Drives, then the 6 app steps and the 4 drill steps in `verify.md` under "Verify: backups & disaster drills". The drill needs a second Supabase project, or Docker, which this machine does not have.
