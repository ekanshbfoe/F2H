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
