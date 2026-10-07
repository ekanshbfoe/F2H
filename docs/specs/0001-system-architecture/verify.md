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
- [ ] `npm test` → 17 tests pass (tokens, Button, TextField, SegmentedToggle, CardDeck, BootScreen) → AC-9
- [ ] `npm run typecheck` → clean → AC-1
- [ ] `npm run lint` → clean, including the React Compiler rules → AC-1
- [ ] `grep -rn "#[0-9A-Fa-f]\{6\}" src/components src/app` → only `design.md` and `src/theme/tokens.ts` hold colour literals (plus the two Button edge colours flagged as TODO tokens) → AC-1

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
- [ ] `npm test -- src/crypto` → 10 suites, 41 tests pass, every vector in `src/crypto/__tests__/vectors.json` reproduced → AC-11 (covers AC-2 to AC-8, AC-10)
- [ ] `npm run typecheck` and `npm run lint` → clean → AC-1 (polyfill import compiles first in `src/app/_layout.tsx`)
- [ ] `node scripts/bench-kdf.ts` → prints scrypt timings for N=2^7..2^14; the default N=2^7 a few ms on Node → AC-12
- [ ] `grep -rn "noble\|scure" src --include=*.ts --include=*.tsx -l | grep -v "^src/crypto"` → no file outside `src/crypto/` imports a crypto library → key invariant
- [ ] `node -e "const v=require('./src/crypto/__tests__/vectors.json'); console.log(v.scrypt[0].dk.slice(0,16), v.hkdf[0].okm.slice(0,16))"` → `fdbabe1c9d347200` and `3cb25f25faacd57a` (RFC 7914 and RFC 5869 published values) → AC-2

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
