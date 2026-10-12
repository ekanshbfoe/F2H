# F2H final testing checklist

Everything left for you to do by hand, in one place. The code is complete for version 0.1.0 and every automated check is green as of 2026-10-12 (jest 62 suites and 366 tests, pgTAP 9 files and 116 checks on the hosted project, typecheck, lint, and `expo-doctor` 21 of 21).

How to use it: do Part 1 and Part 2 once, then work through Part 3 feature by feature. When something fails, note the step and what you saw, and call me back with `/debug <feature>`. When a feature's steps pass, run `/check verify <feature>` so the scope and the spec are ticked properly.

The steps in Part 3 are copied from the `verify.md` files (`docs/specs/0001-system-architecture/verify.md` and `docs/specs/0002-app-lock/verify.md`); those files stay the source of truth, and `/check verify` ticks them there.

---

## Part 1 · Google Cloud console (once, about 15 minutes)

Every Drive, file and backup test needs this.

- [ ] Open the Google Cloud project that owns the OAuth client in `supabase/.env` (`GOOGLE_CLIENT_ID`).
- [ ] APIs and services → Library → enable the **Google Drive API**.
- [ ] Credentials → the OAuth client (type **Web application**) → Authorized redirect URIs → add exactly:
      `https://abkjryjrwvnutwmzbkex.supabase.co/functions/v1/drive-link-callback`
- [ ] OAuth consent screen → scopes → only `https://www.googleapis.com/auth/drive.file` (non sensitive, no verification needed).
- [ ] OAuth consent screen → **Publish app** to Production. In Testing status Google drops the link after 7 days.
- [ ] Nothing to do in Supabase: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `DRIVE_STATE_SECRET` are already set as function secrets, and every Drive function is deployed.

## Part 2 · Build the installable app (EAS)

Push only works in a build, not in Expo Go on Android, so the push steps in Part 3 need this.

- [ ] Log in once: `npx eas-cli login` (the Expo account that owns project `f2h`, id `eebcfc5e-2c28-4bcc-886f-3cf61fbb46d4`).
- [ ] Copy the three public values from your `.env` into EAS: `npm run eas:env`
- [ ] Optional, for push on Android: create a Firebase project for the package `com.ekansh.f2h`, download the FCM V1 service account key, then `npx eas-cli credentials` → Android → Push Notifications → upload it. Without it the build works but receives no push.
- [ ] Build the APK: `npx eas-cli build --profile preview --platform android`
- [ ] Open the link or QR code EAS prints on each family phone and install it.
- [ ] Each installed build is a new phone to F2H: log in, wait for approval (or use the recovery kit on the Admin phone), set a PIN.
- [ ] Later, for the Play Store: `npx eas-cli build --profile production --platform android`

What you need on hand for Part 3: the Admin phone (the LAVA), one member phone or an emulator signed in as a member, a second Admin phone or emulator for the multi phone steps, the paper recovery kit, and for the restore drill a second Supabase project (or Docker).

## Part 3 · Phone and dashboard tests (116 steps)

Recommended order: Feature 15 and 7 first (they protect your access), then 8 and 9 (no Google needed), then 10, 12 and 11 (after Part 1), then 13. The earlier foundation features (3 to 6) are listed first for completeness; most of their steps were exercised during Slice 1 but never ticked.

### Feature 3 · design system & motion (10 steps)

**UI / manual (Expo Go, open the boot screen, then "Open component gallery")**

- [ ] Boot screen shows the bear, the title and the tagline in Poppins (no system font) → AC-2
- [ ] Press each Button: the face sinks onto its darker edge and scales down; Loading shows a spinner and cannot be pressed; Disabled is dimmed and inert → AC-3
- [ ] Type in Email: the underline turns blue and thicker on focus; Confirm password shows the red error line and message; Show/Hide toggles masking → AC-3
- [ ] Open the sheet: it springs up inset from the screen edges with a grab handle and sky blue header icons; drag it down past about 120 px to dismiss; tapping the scrim also closes it → AC-3
- [ ] Tap "Sign up" on the toggle: the pill visibly overshoots the end of the track and settles, the "Login" label drops in from above; Username and Confirm password cascade in one after another; tap "Login" and they fade out while Email and Password reflow → AC-5, AC-6
- [ ] Press Approve on the morph demo: the button grows upward into a full blue panel, "Approving" with a dashed placeholder card and a Stop control appear, then a white circle grows from the centre and reveals "All set" with a Done button; Done returns to the idle button → AC-7
- [ ] Set the glow boxes to filled: digits pop in with a top highlight bar; set success: a blue border traces clockwise with a glow and a small scale pulse; set error: the boxes shake and turn red → AC-7
- [ ] Swipe each onboarding card left or right: the card tilts with the drag, flies off past the threshold, springs back when released early; the deck resets after the last card; the warm orange, yellow and red text appears only on these cards → AC-8
- [ ] Turn on the OS Reduce Motion setting and repeat: springs become plain fades, no border trace, no card tilt → AC-1 (motion presets are the only motion source)
- [ ] Every component in the gallery renders without a raw default control, a black bar or an unstyled element → AC-4

### Feature 4 · crypto core (7 steps)

**UI / manual (Expo Go, boot screen → "Open component gallery" → "Crypto bench")**

- [ ] Press "Run KDF benchmark": the button shows a spinner, then four rows N = 2^6 to 2^9 with millisecond timings and the UI stays responsive; copy the N = 2^7 number into the `SCRYPT_DEFAULT` comment in `src/crypto/kdf.ts` → AC-12
- [ ] The app boots with no red box about `crypto.getRandomValues` or `TextDecoder` → AC-1

**Value sourcing checks**

- [ ] Password split: `passwordSplitSync('Father@Example.COM', pw)` equals `passwordSplitSync('  father@example.com ', pw)`; a different email changes both halves → email lowercased on device (AC-6)
- [ ] Local wrap: the same PIN with a different `device_secret` or `device_salt` gives a different wrap key (test "derives the PIN wrap key") → device values are the second factor
- [ ] Chunk AAD: a chunk copied from a file with another `blob_id`, or a header with an edited `version`/`total_chunks`, is rejected (tests "rejects a chunk from another blob", "rejects a header edited") → blob id and version bind every chunk (AC-9)
- [ ] Verifier: `verifier.check` is false for a different `user_id` even with the right MK → user id is the AAD (AC-7)
- [ ] Fingerprint: `recovery.fingerprint(pub)` is 4 groups of 4 hex chars from sha256(pub); changes completely with a different seed → derived only from the public key

### Feature 5 · backend foundation (1 step)

**Value sourcing checks**

- [ ] Device header: with the anon key and a member JWT, `GET /rest/v1/key_material` without `x-f2h-device` → `[]`; with the approved device's base64 token → one row; with the same token base64 of different bytes → `[]` → header is the only source of the device identity

### Feature 6 · auth & device gate (4 steps)

**UI / manual (Admin phone first, then the member phone)**

- [ ] Second member phone with the same password: log in → Waiting; the Admin rejects it → the phone shows "Request rejected" and returns to login with no key material (SecureStore cleared) → AC-6, AC-12, AC-13
- [ ] Member: Home → Change password → wrong current password refused; a new password works on the next login → AC-16
- [ ] Member: Forgot your password? on the login screen → "No grant yet"; Admin: Members → member → device → Create recovery grant; member: Check again → set a new password → Home opens; the grant cannot be used twice → AC-15
- [ ] Expired state: set a pending device's `requested_at` 25 h back in the SQL editor and call expire-requests → the member phone shows "Request expired" → AC-14, AC-13

### Feature 7 · App lock (2 steps)

**UI / manual**

- [ ] Call an Edge Function from a revoked device while unlocked (for example Change password) → 403 `device_not_approved` → the Wiped screen → AC-10
- [ ] Dev gallery → "Time one PIN unlock" on the LAVA LXX503 → record the ms in the spec Follow-up → AC-13

### Feature 15 · admin device self approval (15 steps)

**UI / manual (Admin phone, after a wipe or on a second phone; the paper kit at hand)**

- [ ] Log in as the Admin on a wiped phone → the waiting screen shows "Use my recovery kit" with the primary "Enter my 24 words" when no other admin phone is approved; with one approved it shows "Can't reach your other phone?" and the secondary button → AC-1
- [ ] Log in as a member on a pending phone → no kit card → AC-1
- [ ] Correct words, "Also sign out my other phones" on → "This phone is approved" appears first; the lost phone shows as signed out; Continue → Set PIN → Home → AC-4, AC-6
- [ ] Dashboard: the new row is `approved` with `decided_by` = the Admin and all four challenge columns null or 0 attempts; the old row `revoked`; `audit_log` has `device.self_approve` and one `device.revoke` with reason `self_approve` → AC-4, AC-6
- [ ] On the success step with another approved admin phone: "Sign out that phone" → the row flips to `revoked`, the badge says Signed out; that phone wipes on its next foreground → AC-6
- [ ] The other admin phone (EAS build, not Expo Go on Android) receives "Admin account recovered" → AC-6
- [ ] Kill the app on the words screen, reopen → waiting screen again; finish the proof → success step, then Continue goes to login; log in → straight to Set PIN → AC-4
- [ ] A member's Forgot PIN confirm never shows the admin copy → AC-7
- [ ] Admin phone A pending, log in as the Admin on phone B → B registers and A's row becomes `expired` with `device.replaced`; A's waiting screen wipes to the expired screen → AC-8

**Commands**

- [ ] `curl -X POST https://<ref>.supabase.co/functions/v1/self-approve-device` with the anon key as bearer → 401 `unauthenticated`; with a member JWT and device header → 403 `admin_required` → AC-2

**Value sourcing checks**

- [ ] Three wrong proofs: run the words screen with a deliberately corrupted tag (dev build, or two `answer` calls with random tags through curl using the Admin JWT and pending header) → `wrong_tag` with `attempts_left` 2 then 1, the third sets `rejected` and the phone wipes as for a rejection → AC-5
- [ ] Let a challenge sit 11 minutes (set `challenge_expires_at` back in the dashboard) then answer → `challenge_expired`, `challenge_attempts` unchanged, the phone re-issues and succeeds → AC-5
- [ ] Six challenge calls on one pending row → the sixth answers 409 `too_many_challenges` → AC-2
- [ ] Cancel the request from the waiting screen while a challenge is open → the row is `expired` with null challenge columns (trigger) → AC-8
- [ ] The cached count: after Home loads on the Admin phone, AsyncStorage holds `f2h.admin_approved_count` equal to the approved admin rows; after sign out it is gone; a member phone never writes it → AC-7

### Feature 8 · contacts vault (17 steps)

**UI / manual (Expo Go on the LAVA, unlocked)**

- [ ] Home → "Your vault" → Contacts → the screen opens with the Call and WhatsApp tabs, both at 0, and the empty card → AC-1, AC-9
- [ ] Add → name "Papa", number `98765 43210`, both switches on → Save → the detail shows `+91 98765 43210` with Call and WhatsApp badges → AC-2
- [ ] Back to the list → Papa is in both tabs; the counts read 1 and 1 → AC-1
- [ ] Detail → Call → the dialer opens with +919876543210; WhatsApp → the chat with that number opens (or wa.me in the browser when WhatsApp is not installed) → AC-3
- [ ] Add a landline `0261 2345678` tagged Call only → the detail disables WhatsApp with the country code reason → AC-3
- [ ] Add with an empty name, or both switches off → the field errors show and nothing is saved → AC-2
- [ ] Search "pap" → Papa; search "2345" → the landline; search "zz" → "Nothing matches" → AC-5
- [ ] Edit Papa → rename → Save → the list shows the new name; pull to refresh keeps it → AC-6
- [ ] Delete the landline → confirm → it leaves the list; the dashboard row has `deleted_at` set and is still there → AC-6
- [ ] Import → "Read my contacts" → deny the permission → the explanation and Try again; deny with "Don't ask again" → Open settings → AC-4
- [ ] Import → allow → the review lists the phone's contacts with numbers; Papa (already added) shows "Already in your vault" and cannot be picked → AC-4
- [ ] Turn WhatsApp on, Select all, Import → "N of N saved" then "N contacts imported"; the WhatsApp tab grows by N → AC-4
- [ ] Lock now while the list is open, then unlock → the list loads again (nothing stale flashes before the PIN) → AC-8
- [ ] In the dashboard, the `ciphertext` of a contact row shows no readable name or number → invariant

**Value sourcing checks**

- [ ] A second phone of the same member edits Papa first, then this phone saves an edit → the save still lands (one automatic retry) → AC-6
- [ ] A contact typed as `+44 20 7946 0958` keeps its code; WhatsApp opens `wa.me/442079460958` → AC-3
- [ ] A member logged in on another phone sees none of this member's contacts → AC-7

### Feature 9 · credential vault (17 steps)

**UI / manual (Expo Go on the LAVA, unlocked)**

- [ ] Home → "Your vault" → Credentials → the empty card; the Bank, Email and Other badges read 0 → AC-1, AC-9
- [ ] Add a credential → Bank is selected and "Customer ID" and "Account number" fields are there → AC-2
- [ ] Save with no title → "Enter a title"; with a title but nothing else → "Add a username, a password or a field to keep" → AC-2
- [ ] Make a strong password → 20 characters and a "Very strong" badge; the length stepper changes it by 4 between 12 and 64; turning sets off leaves at least one on → AC-3
- [ ] Use this password → the password field fills; type `netbanking.example.in` as the website → Save → the detail opens → AC-2, AC-3
- [ ] Detail → the password and the account number show 8 dots whatever their length; Reveal shows the value; 30 seconds later it is dots again → AC-4
- [ ] Reveal, then go back and open the item again → masked → AC-4
- [ ] Copy the password → "Password copied. Clears in 30 seconds."; paste into Notes within 30 s works; after 30 s the clipboard is empty → AC-4
- [ ] Copy, then copy some other text in another app → after 30 s that other text is still on the clipboard → AC-4
- [ ] Copy the password, then Lock now → paste into Notes shows nothing → AC-4, AC-8
- [ ] Try a screenshot on the detail and the form → blocked → AC-5
- [ ] Website → tapping the host opens the browser at `https://netbanking.example.in` → AC-2
- [ ] Search "netbank" finds it; searching part of the password finds nothing → AC-1
- [ ] Edit → change the title → Save; Delete → confirm → gone from the list, the dashboard row has `deleted_at` → AC-6
- [ ] In the dashboard the credential row's `ciphertext` shows no readable title, username or password → AC-7

**Value sourcing checks**

- [ ] A second phone of the same member edits a credential first, then this phone saves → the save lands after one automatic retry → AC-6
- [ ] Type `javascript:alert(1)` as the website → refused with the web address hint → AC-2

### Feature 10 · files & drive redundancy (17 steps)

**Before anything (Google Cloud console, once)**

- [ ] The OAuth client (type Web) lists the redirect URI `https://abkjryjrwvnutwmzbkex.supabase.co/functions/v1/drive-link-callback`
- [ ] The Drive API is enabled for the project, and the consent screen asks only for `drive.file` and is published to **Production** (Testing drops refresh tokens after 7 days)

**UI / manual (Admin phone in Expo Go)**

- [ ] Home → Admin → Google Drives → both slots say "Not linked" → AC-1
- [ ] Drive A → Link with Google → sign in with the Admin's account → allow → back in F2H "Drive A is linked." with the account email → AC-1
- [ ] In that Google Drive a folder `F2H Vault` with a `backups` folder inside exists → AC-1
- [ ] Drive B → the Father signs in on this phone → "Drive B is linked." → AC-1
- [ ] Home → Files → empty card → Add a file → pick a PDF of a few MB → "Encrypting…", then both Drive percentages climb, "Checking both copies…", then "saved on both Drives" → AC-3, AC-4, AC-5, AC-6, AC-10
- [ ] Each Drive's `F2H Vault` folder has one `<hex>.bin` file of about the PDF's size; downloading it from Drive's web page gives bytes that are not a PDF → AC-4, AC-7
- [ ] Turn Wi-Fi off halfway through an upload of a larger file, wait 10 s, turn it on → the upload carries on without starting again → AC-5
- [ ] Open the file → the share sheet offers apps; open it in a PDF viewer → it reads correctly → AC-8, AC-9
- [ ] Lock now, unlock → `cache/f2h-open` is gone (opening again downloads again) → AC-9
- [ ] Delete the file → both `.bin` files are in each Drive's trash; the list no longer shows it → AC-11
- [ ] A member phone with no Drive linked yet (or before the Admin links any) → Add a file → "No Google Drive is linked yet" → AC-3

**Server / dashboard**

- [ ] Unlink Drive B by revoking F2H's access in that Google account (myaccount.google.com → Security → third party access), then upload → the file lands `degraded` ("saved on one Drive"); the next reconcile marks slot B `needs_relink` and the Admin phone gets the push (EAS build) → AC-2, AC-6
- [ ] Relink Drive B, then run reconcile (dashboard SQL `select public.call_edge_function('reconcile-blobs');`) → the degraded blob becomes `ok` and a copy appears on Drive B → AC-12
- [ ] Delete a `.bin` from Drive A's trash permanently, run reconcile → the blob is re copied to A from B → AC-12
- [ ] Set the function secret `DOWNLOAD_MODE=proxy`, open a file → it still opens (bytes stream through the function) → AC-13

### Feature 11 · admin oversight & audit (9 steps)

**UI / manual**

- [ ] Admin: Home → Admin → Members → a member → "Open vault (logged)" → the confirm says the member will be told → Open, logged → the member's contacts, credentials and file names show, with no add, edit or delete anywhere → AC-1, AC-4
- [ ] The member's phone (EAS build for the push) gets "The Admin opened your vault"; their Home → Activity shows "The Admin opened a vault, read only" with the About you badge → AC-2, AC-5
- [ ] In the oversight Credentials tab, a password shows 8 dots, Reveal shows it, and it masks again after 30 s → AC-4
- [ ] Lock now while the oversight screen is open → after unlocking, the oversight screen is gone → AC-4
- [ ] Admin: Activity shows every family event; a member's Activity shows only rows about them → AC-5
- [ ] Admin: Members → a member → an approved phone → "Sign out this phone" → confirm → it shows `revoked`; that phone wipes the next time it opens F2H → AC-6
- [ ] The Admin's own current phone has no "Sign out this phone" button in their own list → AC-6
- [ ] Turn on airplane mode after Contacts, Credentials and Files loaded once → open each list → the "Offline, read only" banner shows the last copy; Add, Import, Edit and Delete are disabled → AC-7
- [ ] Sign out, sign back in while offline → no offline copy is shown (it was erased) → AC-7

### Feature 12 · backups & disaster drills (10 steps)

**UI / manual (after Drive A and B are linked)**

- [ ] Home → Admin → Backups → empty card → Back up now → "Backup saved on both Drives" → a row with "Both Drives" → AC-3, AC-5
- [ ] Each Drive: `F2H Vault/backups/f2h-backup-<today>.bin` exists; downloading it gives noise, not JSON → AC-2, AC-3
- [ ] Back up now again the same day → still one row for today, and one file per Drive → AC-4
- [ ] The next morning (03:00 UTC cron) a new row appears without touching the app → AC-1
- [ ] Unlink Drive B (revoke F2H in that Google account) → Back up now → "One Drive"; the Admin phone gets the push (EAS build) → AC-3
- [ ] A member never sees Backups on Home → AC-5

**Disaster drill (a second Supabase project, or Docker locally)**

- [ ] Download the newest `.bin` from either Drive → `npm run restore:backup -- <file> --out restore.sql` → type the kit → the summary prints and "fingerprint … matches" → AC-6
- [ ] Type a wrong valid phrase → "does not open with this kit"; a different family's kit → the fingerprint mismatch message → AC-6
- [ ] Follow `docs/runbooks/restore.md` on the new project: `db:push`, `restore.sql`, Vault secrets, functions, Drive relink → the Admin logs in with the old password, self approves with the kit, links both Drives, opens an old contact and an old file → AC-6
- [ ] A member logs in on the restored project with their old password → waits → the Admin approves → their old contacts and credentials open → AC-6

### Feature 13 · onboarding & polish (7 steps)

**UI / manual (Expo Go)**

- [ ] Clear the app data (Android settings → Expo Go → storage, or a fresh install) and open F2H → the onboarding deck shows "Your family's vault" in orange on a dark card → AC-1, AC-2
- [ ] Drag the card left, then right → each flies off and the next appears; the dots follow → AC-2
- [ ] Drag the fourth card → the login screen opens → AC-2, AC-3
- [ ] Close and reopen the app → straight to login, no deck → AC-3
- [ ] With TalkBack on, each card reads its title and text, and the dots read "Card n of 4" → AC-2
- [ ] Log in, open Contacts once, go back → Home shows "N saved" under Contacts; Credentials still shows its description until opened → AC-4
- [ ] Forgot PIN wipe → the phone opens at login, not the deck → AC-3

---

## After everything passes

- [ ] Run `/check verify <feature>` for each feature, then `/test <feature>` (and `/check review` plus `/document` for the GA features 4, 6, 10, 12 and 15) so the scope closes properly.
- [ ] Tag the release: `git tag v0.1.0 && git push origin v0.1.0`
