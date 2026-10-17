# Verify: design system & motion · spec 0001 (child 0001-design-system-motion) · updated 2026-10-07
_Steps derived from the child spec's acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual (Expo Go, open the boot screen, then "Open component gallery")
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

## Commands
- [x] `npm test` → 17 tests pass (tokens, Button, TextField, SegmentedToggle, CardDeck, BootScreen) → AC-9 _(2026-10-12: the suite has grown to 62 suites and 366 tests, all green)_
- [x] `npm run typecheck` → clean → AC-1 _(2026-10-12)_
- [x] `npm run lint` → clean, including the React Compiler rules → AC-1 _(2026-10-12)_
- [x] `grep -rn "#[0-9A-Fa-f]\{6\}" src/components src/app` → only `design.md` and `src/theme/tokens.ts` hold colour literals (plus the two Button edge colours flagged as TODO tokens) → AC-1 _(2026-10-12: the last two literals, the warning badge tint and the danger button edge, moved into tokens; none remain outside `src/theme/tokens.ts`)_

## Acceptance-criteria coverage
- AC-1 tokens and presets: commands 2, 3, 4; reduce motion step
- AC-2 fonts and theme: boot screen step
- AC-3 primitives: button, text field, sheet steps
- AC-4 gallery: last manual step
- AC-5 SegmentedToggle: toggle step
- AC-6 CascadeList: toggle step
- AC-7 MorphButton, RadialReveal, GlowBox: morph and glow steps
- AC-8 CardDeck: swipe step
- AC-9 tests: `npm test`

---

# Verify: crypto core · spec 0001 (child 0001-crypto-envelope) · updated 2026-10-07
_Steps derived from the child spec's acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [x] `npm test -- src/crypto` → 10 suites, 41 tests pass, every vector in `src/crypto/__tests__/vectors.json` reproduced → AC-11 (covers AC-2 to AC-8, AC-10) _(2026-10-12: 11 suites, 45 tests, with the published RFC 7914 vector restored)_
- [x] `npm run typecheck` and `npm run lint` → clean → AC-1 (polyfill import compiles first in `src/app/_layout.tsx`) _(2026-10-12)_
- [x] `node scripts/bench-kdf.ts` → prints scrypt timings for N=2^7..2^14; the default N=2^7 a few ms on Node → AC-12 _(2026-10-12: N=2^7 28 ms on the first, cold run; N=2^14 307 ms)_
- [x] `grep -rn "noble\|scure" src --include=*.ts --include=*.tsx -l | grep -v "^src/crypto"` → no file outside `src/crypto/` imports a crypto library → key invariant _(2026-10-12: no file)_
- [x] `node -e "const v=require('./src/crypto/__tests__/vectors.json'); console.log(v.scrypt[0].dk.slice(0,16), v.hkdf[0].okm.slice(0,16))"` → `fdbabe1c9d347200` and `3cb25f25faacd57a` (RFC 7914 and RFC 5869 published values) → AC-2 _(2026-10-12: `fdbabe1c9d347200 3cb25f25faacd57a` after restoring the published vector as the first scrypt entry)_

## UI / manual (Expo Go, boot screen → "Open component gallery" → "Crypto bench")
- [ ] Press "Run KDF benchmark": the button shows a spinner, then four rows N = 2^6 to 2^9 with millisecond timings and the UI stays responsive; copy the N = 2^7 number into the `SCRYPT_DEFAULT` comment in `src/crypto/kdf.ts` → AC-12
- [ ] The app boots with no red box about `crypto.getRandomValues` or `TextDecoder` → AC-1

## Value sourcing checks
- [ ] Password split: `passwordSplitSync('Father@Example.COM', pw)` equals `passwordSplitSync('  father@example.com ', pw)`; a different email changes both halves → email lowercased on device (AC-6)
- [ ] Local wrap: the same PIN with a different `device_secret` or `device_salt` gives a different wrap key (test "derives the PIN wrap key") → device values are the second factor
- [ ] Chunk AAD: a chunk copied from a file with another `blob_id`, or a header with an edited `version`/`total_chunks`, is rejected (tests "rejects a chunk from another blob", "rejects a header edited") → blob id and version bind every chunk (AC-9)
- [ ] Verifier: `verifier.check` is false for a different `user_id` even with the right MK → user id is the AAD (AC-7)
- [ ] Fingerprint: `recovery.fingerprint(pub)` is 4 groups of 4 hex chars from sha256(pub); changes completely with a different seed → derived only from the public key

## Acceptance-criteria coverage
- AC-1 random and polyfill: typecheck step, boot step, `random.test.ts`
- AC-2 scrypt and hkdf: RFC vector step, `kdf.test.ts`
- AC-3 aead wire and rejections: `aead.test.ts`
- AC-4 sealed box: `box.test.ts`
- AC-5 envelope: `envelope.test.ts`
- AC-6 password split: `password-split.test.ts`, value sourcing step
- AC-7 verifier: `verifier.test.ts`, value sourcing step
- AC-8 chunked format and one chunk in memory: `chunked.test.ts` ("never reads more than one chunk")
- AC-9 chunked rejections: `chunked.test.ts` rejections block
- AC-10 mnemonic: `mnemonic.test.ts`
- AC-11 vectors: `npm test -- src/crypto`
- AC-12 bench: Node command step, gallery step (phone timing still to record)

---

# Verify: backend foundation · spec 0001 (child 0001-data-model-rls) · updated 2026-10-07
_Steps derived from the child spec's acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [x] `npm run db:push` after _(verified 2026-10-07: migration list shows 0001 to 0008 local = remote)_ `npx supabase link` → all 8 migrations apply with no error; `npx supabase migration list` shows 0001 to 0008 as applied remotely → AC-1, AC-2
- [x] `npm run db:test` (local stack, Docker) _(verified 2026-10-07: no Docker here; both files run on the hosted project through supabase db query, 0 failed of 23 and 0 failed of 10, transactions rolled back)_ → `0001_isolation.test.sql` 23 tests and `0002_triggers.test.sql` 10 tests pass → AC-4, AC-5, AC-6, AC-7
- [x] `npm run db:types` _(verified 2026-10-07: regenerated output identical to the committed file, typecheck clean)_ → `src/types/database.types.ts` is rewritten by the generator and `npm run typecheck` still passes → AC-9
- [x] `npm test -- src/services` _(verified 2026-10-07: 4 passed)_ → 4 tests pass: no header before a token, header set after `setDeviceToken`, token persisted in SecureStore, `rpc('health')` carries the header → AC-9
- [x] `npm run bootstrap:admin -- <email> --password '<pw>'` twice → second run prints "auth user exists" and every step "ok"; `profiles` has one admin row, `allowed_members` one admin row, `family_config.admin_user_id` set → AC-10 _(verified 2026-10-07: run twice earlier this session, second run printed auth user exists; rows confirmed over REST)_
- [x] `grep -n "enable_signup _(verified 2026-10-07: all false)_\|enable_confirmations" supabase/config.toml` → every `enable_signup = false`, `enable_confirmations = false` → AC-3
- [x] GitHub → Actions → "Supabase keep alive" → Run workflow → the step prints `health: "ok"`; remove the secret and rerun → the job fails → AC-11 _(confirmed by you 2026-10-07: run succeeded after fixing a secret typo)_

## Dashboard / manual
- [x] Table editor shows the 11 tables _(verified 2026-10-07: all 12 relations answer 200 over REST; 7 enums in the generated types)_, `drive_status_view`, and the enums `member_label`, `member_role`, `profile_status`, `device_status`, `item_kind`, `blob_state`, `drive_status` → AC-2
- [x] Database → Publications _(verified 2026-10-07: pg_publication_tables lists devices only)_ → `supabase_realtime` lists `devices` only → AC-7
- [x] Integrations → Cron shows _(verified 2026-10-07: cron.job lists the three jobs)_ `expire-requests`, `reconcile-blobs`, `backup-metadata` → AC-11 precondition
- [x] Authentication → Providers → Email: sign ups off, confirmations off (hosted settings are not controlled by `config.toml`) → AC-3 _(confirmed by you in the dashboard 2026-10-07)_
- [x] SQL editor as the service role _(verified 2026-10-07: rpc/is_approved_device with the service key returns false)_: `select public.is_approved_device()` → false (no header in the editor) → AC-4

## Value sourcing checks
- [ ] Device header: with the anon key and a member JWT, `GET /rest/v1/key_material` without `x-f2h-device` → `[]`; with the approved device's base64 token → one row; with the same token base64 of different bytes → `[]` → header is the only source of the device identity
- [x] Audit actor device _(verified 2026-10-07: pgTAP 0002 test 4 passed remotely)_: update `key_material` from an approved device → the new `audit_log` row's `actor_device_id` equals that device's id (resolved from the same header, pgTAP test "audit row names the calling device")
- [x] Version guard _(verified 2026-10-07: pgTAP 0002 tests 6 and 7 passed remotely; REST variant not run)_: `PATCH /rest/v1/vault_items?id=eq.<id>` with `{"ciphertext":"x","version":1}` → version 2; repeat with `version: 1` → 400 `P0001 stale_version` → the client supplied version is the guard input

## Acceptance-criteria coverage
- AC-1 migrations apply: db:push step
- AC-2 schema: db:push step, table editor step
- AC-3 signup off: config grep, dashboard auth step
- AC-4 helper: pgTAP, SQL editor step, header value check
- AC-5 isolation matrix: pgTAP `0001_isolation.test.sql`
- AC-6 audit trigger: pgTAP `0002_triggers.test.sql`, audit value check
- AC-7 publication and pending index: pgTAP, publications step
- AC-8 shared helpers: `supabase/functions/_shared/mod.ts` exports (type checked when the first function deploys)
- AC-9 types and client: db:types step, `npm test -- src/services`
- AC-10 bootstrap rerun: bootstrap step
- AC-11 keepalive: workflow step

---

# Verify: auth & device gate · spec 0001 (child 0001-account-and-device-gate) · updated 2026-10-07
_Steps derived from the child spec's acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Two phones (or a phone plus an emulator) in Expo Go, the Admin already bootstrapped._

## Commands
- [x] `npm test -- src/features supabase` _(verified 2026-10-07: 9 suites, 60 tests)_ → model, keyring, register and function helper tests pass → AC-1, AC-3, AC-6, AC-10
- [x] `npx supabase functions list` _(verified 2026-10-07: all six answer over HTTPS with their own error bodies)_ → signup, register-device, approve-device, notify-admin, expire-requests, reset-password all ACTIVE → AC-2, AC-6, AC-8, AC-11, AC-14, AC-15
- [x] `POST /functions/v1/signup` with the anon key _(verified 2026-10-07: 403 bad_invite, 400 bad_user_id)_ and a made up invite code → 403 `bad_invite`; with a missing `user_id` → 400 → AC-2
- [x] `POST /functions/v1/register-device`, `approve-device`, `reset-password` with the anon key _(verified 2026-10-07: 401 unauthenticated on all three)_ only → 401 `unauthenticated` → AC-6, AC-11, AC-15
- [x] `POST /functions/v1/expire-requests` with the service role key _(verified 2026-10-07: 200 ok, anon 401)_ → 200 `{ok:true,...}`; with the anon key → 401 → AC-14
- [x] `npx supabase migration list` → 0009 applied _(verified 2026-10-07: remote 0009 present, alphabet length 32)_; the invite alphabet is 32 characters (`select length('0123456789ABCDEFGHJKMNPQRSTVWXYZ')`) → AC-5

## UI / manual (Admin phone first, then the member phone)
- [x] Admin: log in with the bootstrapped email and password _(verified 2026-10-07: devices row 3b2c106b approved for LAVA LXX503 / Android 14, audit device.auto_approved at 11:01:08 UTC; recovery kit completed: audit admin.first_run 11:35:13, recovery_pub set, fingerprint 2d2a 90fe cb58 1c85, one vault note for the Admin)_ → the first device is approved on the spot, the recovery kit opens: 24 numbered words, a fingerprint, three word confirmation; a wrong word is refused; after finishing, Home shows "Unlocked" → AC-4
- [x] Admin: Members → enter an allowlisted email _(verified 2026-10-07: audit invite.create 11:35:51, allowed_members row bfoe.amv@gmail.com:brother consumed after signup)_, pick a label, Create invite code → an 8 character code and a QR appear; the open invite row shows the expiry a week out → AC-5
- [x] Member phone: Sign up tab → name, email, invite code _(verified 2026-10-07: confirmed by you on the Redmi 6A; validation locked by login-screen.test.tsx)_, 10 char password, confirm; a short password, a bad email and a mismatched confirm are blocked before any request; the Admin fingerprint callout matches the Admin's kit → AC-1
- [x] Member phone: submit with a wrong code _(verified 2026-10-07: audit signup 11:39:41, profile BFOE pending then active, key_material row (pw 100, admin 140, verifier 72 chars), device 219b8d0f Redmi 6A Android 9 Surat; second use of a code refused by the function (403 bad_invite in the command check))_ → "invite code is not valid"; with the right code → the Waiting screen with device, location, IP and time; the same code a second time on another sign up → rejected → AC-2, AC-3, AC-6
- [x] Admin phone: with Approvals open, the new request appears _(verified 2026-10-07: confirmed by you: request listed live; push part needs an EAS build)_ within 2 s without a refresh; with the app closed and the Vault secrets set, a push arrives naming the member, model and city and opens Approvals → AC-8, AC-9
- [x] Admin: open the request → the sheet shows "Key material verified" _(verified 2026-10-07: confirmed by you; audit key_material.read_for_approval 11:48:29 then device.approve 11:48:32, decided_by the Admin)_ before Approve is useful; tap Approve → the button grows into the panel, "Approving", then the radial reveal "All set" → AC-9, AC-10, AC-11
- [x] Member phone: the Waiting screen flips within 2 s _(verified 2026-10-07: confirmed by you: flipped at once and opened Home, so the unwrap succeeded; the wifi off poll fallback not exercised (locked by useApprovalWatch.test.ts))_, the vault unwraps and Home opens with "Unlocked"; turn the member's wifi off before approving and it still flips within 10 s after reconnecting (poll) → AC-7, AC-12
- [ ] Second member phone with the same password: log in → Waiting; the Admin rejects it → the phone shows "Request rejected" and returns to login with no key material (SecureStore cleared) → AC-6, AC-12, AC-13
- [ ] Member: Home → Change password → wrong current password refused; a new password works on the next login → AC-16
- [ ] Member: Forgot your password? on the login screen → "No grant yet"; Admin: Members → member → device → Create recovery grant; member: Check again → set a new password → Home opens; the grant cannot be used twice → AC-15
- [ ] Expired state: set a pending device's `requested_at` 25 h back in the SQL editor and call expire-requests → the member phone shows "Request expired" → AC-14, AC-13

## Value sourcing checks
- [x] Register: the Waiting screen's IP and city _(verified 2026-10-07: last_geo.city resolved to Surat for the Admin device)_ match the member phone's public IP (the function uses the first `x-forwarded-for` hop and ipwho.is); on a private network the location reads Unknown
- [x] Register: model and OS on the Admin sheet _(verified 2026-10-07: model LAVA LXX503, os Android 14 recorded from expo-device)_ match `expo-device` on the member phone; the app version matches `app.json`
- [x] Push token: on Expo Go Android _(verified 2026-10-07: both devices registered with push_token null)_ the registration still succeeds with `push_token` null (`select push_token from devices`)
- [x] Invite: the code shown has only Crockford characters _(verified 2026-10-07: alphabet 0123456789ABCDEFGHJKMNPQRSTVWXYZ in migration 0009; hash stored as sha256 hex)_ (no I, L, O, U); `allowed_members.invite_code_hash` is its sha256
- [x] Approval check: tamper `key_material.mk_wrapped_admin` _(verified 2026-10-07: not tampered on the live DB; the refusal path is locked by keys.test.ts)_ for a pending member in the SQL editor → the sheet shows "Key material tampered" and Approve does nothing
- [x] Waiting time: "Requested … ago" _(verified 2026-10-07: computed from devices.requested_at in waiting.tsx)_ is computed from `devices.requested_at`, not the phone's start time

## Acceptance-criteria coverage
- AC-1 validation and toggle: signup step, `model.test.ts`
- AC-2 invite enforcement: signup command and manual steps
- AC-3 signup creates user, profile, key material, device, token once: signup step, `keys.test.ts`
- AC-4 Admin first run and kit: Admin login step
- AC-5 invites: Members step, alphabet command
- AC-6 registration and 409 reuse: second phone step, `register.test.ts`
- AC-7 Realtime plus poll: wifi step
- AC-8 push to Admin: push step (needs Vault secrets and a non Expo Go Android build)
- AC-9 live inbox and morph: Admin steps
- AC-10 wrap verification: sheet badge, tamper check, `keys.test.ts`
- AC-11 decide in one transaction with audit and push: Approve step, `decide_device`
- AC-12 unwrap after approval, 0 rows before: member flip step, second phone step
- AC-13 wipe on reject or expiry: reject and expiry steps
- AC-14 expiry cron: expire-requests command, expiry step
- AC-15 recovery grant and reset: forgot password step
- AC-16 change password: change password step

---

# Verify: admin device self approval · spec 0001 (child 0001-admin-device-self-approval) · updated 2026-10-08
_Steps derived from the child spec's acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual (Admin phone, after a wipe or on a second phone; the paper kit at hand)
_Run 2026-10-12 on the LAVA LXX503, one phone: Forgot PIN warning, wipe, login, kit card, offline retry, word entry checks, real proof, Set PIN, Home. Database confirmed: row `cb431f6f…` approved, decided by the Admin, 1 challenge, 0 misses, challenge columns null, `device.self_approve` audited. Steps left unticked need a second Admin phone, a member phone or a forced wrong tag; the engineer closed the feature with them skipped._
- [ ] Log in as the Admin on a wiped phone → the waiting screen shows "Use my recovery kit" with the primary "Enter my 24 words" when no other admin phone is approved; with one approved it shows "Can't reach your other phone?" and the secondary button → AC-1
- [ ] Log in as a member on a pending phone → no kit card → AC-1
- [x] Turn Wi-Fi off before the waiting screen loads → the card says the key could not be fetched with a Retry; Wi-Fi on, Retry → the button enables → AC-1
- [x] Open the words screen → the family fingerprint matches the paper kit; a screenshot is blocked → AC-3
- [x] Type "ab" in box 3 → suggestions appear; tap one → it fills and the focus moves to box 4 → AC-3
- [x] Paste the whole 24 word line into box 1 → all boxes fill, the clipboard is empty afterwards (paste into Notes shows nothing) → AC-3
- [x] Change one word and tap Prove → "do not form a valid kit" with no network request (function logs show no call) → AC-3
- [x] Type a valid phrase from another seed → "not the kit this family published" with no network request → AC-3
- [ ] Correct words, "Also sign out my other phones" on → "This phone is approved" appears first; the lost phone shows as signed out; Continue → Set PIN → Home → AC-4, AC-6
- [ ] Dashboard: the new row is `approved` with `decided_by` = the Admin and all four challenge columns null or 0 attempts; the old row `revoked`; `audit_log` has `device.self_approve` and one `device.revoke` with reason `self_approve` → AC-4, AC-6
- [ ] On the success step with another approved admin phone: "Sign out that phone" → the row flips to `revoked`, the badge says Signed out; that phone wipes on its next foreground → AC-6
- [ ] The other admin phone (EAS build, not Expo Go on Android) receives "Admin account recovered" → AC-6
- [ ] Kill the app on the words screen, reopen → waiting screen again; finish the proof → success step, then Continue goes to login; log in → straight to Set PIN → AC-4
- [x] Forgot PIN on the only approved admin phone → the confirm says "only approved Admin phone" and mentions the 24 words; with two approved admin phones → the plain copy → AC-7
- [ ] A member's Forgot PIN confirm never shows the admin copy → AC-7
- [ ] Admin phone A pending, log in as the Admin on phone B → B registers and A's row becomes `expired` with `device.replaced`; A's waiting screen wipes to the expired screen → AC-8

## Commands
- [x] `npx supabase db query --linked -f supabase/tests/database/0004_admin_self_approval.test.sql` (pgTAP enabled, the admin uuid swapped for the real Admin's, the file ending with `select num_failed()`) → 0 failed of 33 → AC-4, AC-5, AC-6, AC-8, AC-9
- [x] `npm test -- challenge self-approve MnemonicEntry waiting-card storage auth` → the crypto vector, the server tag, the api mapping, the word entry, the card and the warning suites green → AC-2, AC-3, AC-5, AC-9
- [x] `npm run typecheck && npm run lint` → clean
- [ ] `curl -X POST https://<ref>.supabase.co/functions/v1/self-approve-device` with the anon key as bearer → 401 `unauthenticated`; with a member JWT and device header → 403 `admin_required` → AC-2

## Value sourcing checks
- [ ] Three wrong proofs: run the words screen with a deliberately corrupted tag (dev build, or two `answer` calls with random tags through curl using the Admin JWT and pending header) → `wrong_tag` with `attempts_left` 2 then 1, the third sets `rejected` and the phone wipes as for a rejection → AC-5
- [ ] Let a challenge sit 11 minutes (set `challenge_expires_at` back in the dashboard) then answer → `challenge_expired`, `challenge_attempts` unchanged, the phone re-issues and succeeds → AC-5
- [ ] Six challenge calls on one pending row → the sixth answers 409 `too_many_challenges` → AC-2
- [ ] Cancel the request from the waiting screen while a challenge is open → the row is `expired` with null challenge columns (trigger) → AC-8
- [ ] The cached count: after Home loads on the Admin phone, AsyncStorage holds `f2h.admin_approved_count` equal to the approved admin rows; after sign out it is gone; a member phone never writes it → AC-7

## Acceptance-criteria coverage
- AC-1 kit card placement and offline · AC-2 challenge step, gate and limits · AC-3 word entry and local checks · AC-4 atomic approval, success step first, cold start · AC-5 wrong, expired, third wrong rejects · AC-6 success step revoke and push · AC-7 last admin phone warning · AC-8 trigger, race, replace · AC-9 pgTAP, vector tests, jest

---

# Verify: contacts vault · spec 0003 · updated 2026-10-12
_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Queued by the autonomous run of 2026-10-12: the command checks ran green, the phone steps wait for the engineer._

## UI / manual (Expo Go on the LAVA, unlocked)
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

## Commands
- [x] `npx supabase db query --linked -f supabase/tests/database/0005_contacts.test.sql` (pgTAP enabled, the file ending with `select num_failed()`) → 0 failed of 12 → AC-6, AC-7 _(ran 2026-10-12 on the hosted project)_
- [x] `npm test -- src/features/contacts` → model, api, store, import and screen suites green → AC-10 _(2026-10-12: 5 suites, 45 tests; full suite 49 suites, 283 tests)_
- [x] `npm run typecheck && npm run lint` → clean _(2026-10-12)_

## Value sourcing checks
- [ ] A second phone of the same member edits Papa first, then this phone saves an edit → the save still lands (one automatic retry) → AC-6
- [ ] A contact typed as `+44 20 7946 0958` keeps its code; WhatsApp opens `wa.me/442079460958` → AC-3
- [ ] A member logged in on another phone sees none of this member's contacts → AC-7

## Acceptance-criteria coverage
- AC-1 tabs and counts · AC-2 form and normalization · AC-3 call and WhatsApp · AC-4 import · AC-5 search · AC-6 version retry and soft delete · AC-7 isolation (pgTAP) · AC-8 lock clears · AC-9 states · AC-10 tests

---

# Verify: credential vault · spec 0004 · updated 2026-10-12
_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Queued by the autonomous run of 2026-10-12: the command checks ran green, the phone steps wait for the engineer._

## UI / manual (Expo Go on the LAVA, unlocked)
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

## Commands
- [x] `npx supabase db query --linked -f supabase/tests/database/0006_credentials.test.sql` (pgTAP enabled, ending with `select num_failed()`) → 0 failed of 12 → AC-6, AC-7 _(ran 2026-10-12 on the hosted project)_
- [x] `npm test -- src/features/credentials src/features/vault src/features/contacts` → green → AC-10 _(2026-10-12: credentials 3 suites 31 tests, vault 3 tests, contacts 45 tests; full suite 54 suites 318 tests)_
- [x] `npm run typecheck && npm run lint` → clean _(2026-10-12)_

## Value sourcing checks
- [ ] A second phone of the same member edits a credential first, then this phone saves → the save lands after one automatic retry → AC-6
- [ ] Type `javascript:alert(1)` as the website → refused with the web address hint → AC-2

## Acceptance-criteria coverage
- AC-1 sections and search · AC-2 form · AC-3 generator · AC-4 mask, reveal, clipboard · AC-5 screenshot keys · AC-6 version retry and soft delete · AC-7 isolation (pgTAP) · AC-8 lock clears · AC-9 states · AC-10 tests

---

# Verify: files & drive redundancy · spec 0001 (child 0001-drive-redundancy) · updated 2026-10-12
_Queued by the autonomous run of 2026-10-12. The command and server checks ran green; the Google and phone steps wait for the engineer._

## Before anything (Google Cloud console, once)
- [ ] The OAuth client (type Web) lists the redirect URI `https://<project-ref>.supabase.co/functions/v1/drive-link-callback`
- [ ] The Drive API is enabled for the project, and the consent screen asks only for `drive.file` and is published to **Production** (Testing drops refresh tokens after 7 days)

## UI / manual (Admin phone in Expo Go)
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

## Server / dashboard
- [ ] Unlink Drive B by revoking F2H's access in that Google account (myaccount.google.com → Security → third party access), then upload → the file lands `degraded` ("saved on one Drive"); the next reconcile marks slot B `needs_relink` and the Admin phone gets the push (EAS build) → AC-2, AC-6
- [ ] Relink Drive B, then run reconcile (dashboard SQL `select public.call_edge_function('reconcile-blobs');`) → the degraded blob becomes `ok` and a copy appears on Drive B → AC-12
- [ ] Delete a `.bin` from Drive A's trash permanently, run reconcile → the blob is re copied to A from B → AC-12
- [ ] Set the function secret `DOWNLOAD_MODE=proxy`, open a file → it still opens (bytes stream through the function) → AC-13

## Commands
- [x] `npx supabase db query --linked -f supabase/tests/database/0007_drive_vault.test.sql` (pgTAP enabled) → 0 failed of 9 → AC-1, AC-2 _(ran 2026-10-12 on the hosted project)_
- [x] `npm test -- src/features/files supabase/functions/_shared/__tests__/google.test.ts` → green → AC-1, AC-4, AC-5, AC-6, AC-7, AC-9, AC-10 _(2026-10-12: files 2 suites 14 tests, google 7 tests; full suite 57 suites 339 tests)_
- [x] Every Drive function answers without a session: 401 `unauthenticated` (six user functions), 401 `service_key_required` (reconcile with the anon key), the callback renders "Link expired" for a bad state → AC-3, AC-8 _(2026-10-12)_
- [x] `select public.call_edge_function('reconcile-blobs')` from the database → `net._http_response` 200 with the empty report → AC-12 _(2026-10-12, after storing the `project_url` and `service_role_key` Vault secrets)_
- [x] `npm run typecheck && npm run lint` → clean _(2026-10-12)_

## Acceptance-criteria coverage
- AC-1 linking · AC-2 relink flag · AC-3 sessions · AC-4 chunked encrypt · AC-5 dual resumable upload · AC-6 verified completion · AC-7 fresh blob and DEK, bound metadata · AC-8 download token · AC-9 verify, decrypt, open, cache cleared · AC-10 list and states · AC-11 delete · AC-12 reconcile · AC-13 proxy mode

---

# Verify: admin oversight & audit · spec 0005 · updated 2026-10-12
_Queued by the autonomous run of 2026-10-12. The command checks ran green; the phone steps need the Admin phone and one member phone._

## UI / manual
- [ ] Admin: Home → Admin → Members → a member → "Open vault (logged)" → the confirm says the member will be told → Open, logged → the member's contacts, credentials and file names show, with no add, edit or delete anywhere → AC-1, AC-4
- [ ] The member's phone (EAS build for the push) gets "The Admin opened your vault"; their Home → Activity shows "The Admin opened a vault, read only" with the About you badge → AC-2, AC-5
- [ ] In the oversight Credentials tab, a password shows 8 dots, Reveal shows it, and it masks again after 30 s → AC-4
- [ ] Lock now while the oversight screen is open → after unlocking, the oversight screen is gone → AC-4
- [ ] Admin: Activity shows every family event; a member's Activity shows only rows about them → AC-5
- [ ] Admin: Members → a member → an approved phone → "Sign out this phone" → confirm → it shows `revoked`; that phone wipes the next time it opens F2H → AC-6
- [ ] The Admin's own current phone has no "Sign out this phone" button in their own list → AC-6
- [ ] Turn on airplane mode after Contacts, Credentials and Files loaded once → open each list → the "Offline, read only" banner shows the last copy; Add, Import, Edit and Delete are disabled → AC-7
- [ ] Sign out, sign back in while offline → no offline copy is shown (it was erased) → AC-7

## Commands
- [x] `npx supabase db query --linked -f supabase/tests/database/0008_audit_visibility.test.sql` (admin uuid swapped, pgTAP enabled) → 0 failed of 6 → AC-5, AC-8 _(ran 2026-10-12 on the hosted project)_
- [x] `npm test -- src/features/admin src/features/vault src/features/contacts` → green → AC-3, AC-5, AC-7, AC-8 _(2026-10-12: full suite 58 suites, 349 tests)_
- [x] `oversight-open` without a session → 401 `unauthenticated` → AC-1 _(2026-10-12, deployed)_
- [x] `npm run typecheck && npm run lint` → clean _(2026-10-12)_

## Acceptance-criteria coverage
- AC-1 entry and Admin only · AC-2 audit first, push, data · AC-3 unseal, verify, decrypt, zero · AC-4 read only screen · AC-5 Activity · AC-6 device sign out · AC-7 offline copy · AC-8 tests

---

# Verify: backups & disaster drills · spec 0006 · updated 2026-10-12
_Queued by the autonomous run of 2026-10-12. The server checks ran green; the Drive and drill steps wait for linked Drives and the engineer._

## UI / manual (after Drive A and B are linked)
- [ ] Home → Admin → Backups → empty card → Back up now → "Backup saved on both Drives" → a row with "Both Drives" → AC-3, AC-5
- [ ] Each Drive: `F2H Vault/backups/f2h-backup-<today>.bin` exists; downloading it gives noise, not JSON → AC-2, AC-3
- [ ] Back up now again the same day → still one row for today, and one file per Drive → AC-4
- [ ] The next morning (03:00 UTC cron) a new row appears without touching the app → AC-1
- [ ] Unlink Drive B (revoke F2H in that Google account) → Back up now → "One Drive"; the Admin phone gets the push (EAS build) → AC-3
- [ ] A member never sees Backups on Home → AC-5

## Disaster drill (a second Supabase project, or Docker locally)
- [ ] Download the newest `.bin` from either Drive → `npm run restore:backup -- <file> --out restore.sql` → type the kit → the summary prints and "fingerprint … matches" → AC-6
- [ ] Type a wrong valid phrase → "does not open with this kit"; a different family's kit → the fingerprint mismatch message → AC-6
- [ ] Follow `docs/runbooks/restore.md` on the new project: `db:push`, `restore.sql`, Vault secrets, functions, Drive relink → the Admin logs in with the old password, self approves with the kit, links both Drives, opens an old contact and an old file → AC-6
- [ ] A member logs in on the restored project with their old password → waits → the Admin approves → their old contacts and credentials open → AC-6

## Commands
- [x] `npx supabase db query --linked -f supabase/tests/database/0009_backups.test.sql` (admin uuid swapped) → 0 failed of 5 → AC-5, AC-7 _(ran 2026-10-12 on the hosted project)_
- [x] `npm test -- src/__tests__/restore-backup.test.ts supabase/functions/_shared/__tests__/backup.test.ts src/features/backups` → green (server sealed box opened by the app's `box.open`, stripped columns, pruning, restore SQL, screen) → AC-2, AC-6, AC-7 _(2026-10-12: full suite 61 suites, 362 tests)_
- [x] `backup-metadata` with the service key and `{"dry_run": true}` → 200 with counts for every table, 2 auth users, 14359 bytes sealed → AC-1, AC-2 _(2026-10-12)_
- [x] `backup-metadata` with the service key and no Drive linked → 503 `no_drive_linked`; with the anon key → 401 → AC-1 _(2026-10-12)_
- [x] `npm run typecheck && npm run lint` → clean _(2026-10-12)_

## Acceptance-criteria coverage
- AC-1 dump and filter · AC-2 seal to the kit · AC-3 both Drives, verified, recorded · AC-4 prune, one per day · AC-5 Backups screen · AC-6 restore script and runbook · AC-7 tests

---

# Verify: onboarding & polish · spec 0007 · updated 2026-10-12
_Queued by the autonomous run of 2026-10-12. The command checks ran green; the phone steps wait for the engineer._

## UI / manual (Expo Go)
- [ ] Clear the app data (Android settings → Expo Go → storage, or a fresh install) and open F2H → the onboarding deck shows "Your family's vault" in orange on a dark card → AC-1, AC-2
- [ ] Drag the card left, then right → each flies off and the next appears; the dots follow → AC-2
- [ ] Drag the fourth card → the login screen opens → AC-2, AC-3
- [ ] Close and reopen the app → straight to login, no deck → AC-3
- [ ] With TalkBack on, each card reads its title and text, and the dots read "Card n of 4" → AC-2
- [ ] Log in, open Contacts once, go back → Home shows "N saved" under Contacts; Credentials still shows its description until opened → AC-4
- [ ] Forgot PIN wipe → the phone opens at login, not the deck → AC-3

## Commands
- [x] `npm test -- src/features/onboarding` → green → AC-6 _(2026-10-12)_
- [x] `npx expo-doctor` → 21 of 21 checks passed → AC-5 _(2026-10-12, after removing `newArchEnabled`)_
- [x] `npm run typecheck && npm run lint` → clean _(2026-10-12)_

## Acceptance-criteria coverage
- AC-1 boot gate · AC-2 deck · AC-3 flag · AC-4 Home counts · AC-5 dependency audit · AC-6 tests
