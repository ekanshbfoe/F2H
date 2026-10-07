# 0001. F2H system architecture: rationale

## Context

Four family members need one private place for contacts, credentials and files. The threat that matters most is not a nation state; it is a lost phone, a leaked password, a curious relative, or a cloud account being closed. The owner asked for zero trust: the cloud must hold nothing readable, every unknown device must be approved by the Admin by hand, and the Admin must still be able to open any vault in an emergency. Files must survive the loss of one Google account. Development happens in Expo Go to keep RAM low, which rules out any native module Expo Go does not bundle. Everything must fit free tiers and the APK must carry no secret.

Not deciding leaves the builder to invent the key hierarchy, the device gate and the storage topology mid build; those are the three things that cannot be changed later without a migration of every encrypted item.

## Options considered

### Option 1: Expo + Supabase + dual Google Drive, client side envelope encryption (chosen)

Supabase provides auth, Postgres with RLS, Realtime, Deno functions, secret storage and cron in one free project with no card. Drive is reached only through functions holding the refresh tokens; the phone uploads straight to resumable session URIs. All crypto is pure JS.

**Pros**: one backend, RLS enforced isolation, realtime for the relay, outbound HTTP from functions is free, secrets never in the APK.
**Cons**: free tier pausing and no backups (mitigated by keep alive and Drive snapshots); pure JS crypto speed; Realtime RLS cannot see custom headers (so the only Realtime table carries no secrets).

### Option 2: Expo + Convex + dual Google Drive

Convex's reactive queries make the approval relay trivial and actions can call Google APIs.

**Pros**: realtime by default, scheduled functions, generous free tier.
**Cons**: auth is a separate provider (Clerk or Convex Auth beta), no SQL RLS (isolation lives in function code), fewer people know it; the owner asked for the most conventional free path.

### Option 3: Expo + Firebase (Firestore, Cloud Functions, FCM)

**Pros**: push is first class, Firestore listeners are realtime.
**Cons**: Cloud Functions need the Blaze plan (card on file) to make outbound calls to Google Drive; security rules are weaker than RLS for relational checks; document model fits poorly.

### Option 4: Expo + Cloudflare Workers + D1 + Durable Objects

**Pros**: cheapest at scale, websockets via Durable Objects.
**Cons**: no auth product, no RLS, much more code for a four user app.

## Rationale

Option 1 is the only one that gives a free, card free backend with database enforced isolation, websocket realtime and server side secret storage in one place. The device gate needs the database to refuse key material to unapproved devices; RLS with a request header does that in SQL, which is more trustworthy than application code. Dual Drive via resumable session URIs keeps bytes off the function (egress budget) while keeping tokens off the phone for uploads. Pure JS crypto is the price of Expo Go, paid once behind an abstraction.

## Threat model

Assets: plaintext contacts, credentials, files; the four Master Keys; the Admin recovery seed; the Google refresh tokens; device trust.

| Adversary | What they get | Mitigation |
|---|---|---|
| Supabase or Google breached, or an insider | Ciphertext, wrapped keys, emails, device names, IPs | Secrets encrypted on device; MK wrapped only by device derived keys or the Admin recovery public key; the server never sees the KEK half of the password. Residual: an insider could swap `admin_recovery_pubkey`; the fingerprint is shown on signup and in the recovery kit for out of band comparison |
| Stranger who learned a member's password | Logs in, lands in `pending` on an unknown device | `key_material` unreadable without an approved device token; Admin gate with model, IP, city; one pending request per user; 24 h expiry |
| Stranger who knows a family email before signup | Nothing | Public signup disabled; invite codes handed over in person; Admin seeded out of band |
| Lost locked phone | Nothing without the PIN | MK wrapped by scrypt(PIN) + 256 bit hardware stored device secret; backoff after 5, wipe after 10; remote revoke |
| Lost unlocked phone | Current session plaintext | Auto lock after 60 s background; Android FLAG_SECURE; iOS inactive overlay; lock now shortcut |
| Curious family member | Only their own rows | RLS `owner_id = auth.uid()`; the only cross owner read is the Admin path, logged and pushed |
| Rogue or careless Admin | Can decrypt any vault (by design) | Immutable audit visible to the member; recovery private key never in the cloud in plaintext |
| Member blinding oversight by replacing `mk_wrapped_admin` | Oversight for that member breaks | Every update audited and pushed to the Admin; the Admin phone verifies the sealed wrap against `mk_verifier` at approval and on demand |
| Member with a 1 h `drive.file` token | Could list or trash F2H blobs (ciphertext) | Two copies, 30 day trash, nightly reconcile; proxy mode switch |
| Malicious app on the phone | Nothing without OS compromise | Hardware keystore; MK in memory only while unlocked |
| Rooted phone with device secret extracted | 6 digit PIN falls to offline brute force in minutes | Documented limit; the wipe is app enforced; Admin can revoke |
| Replay or forged device header | None | 32 random byte token, only its hash stored, TLS only |

Out of scope: a compromised OS, a user who photographs their own screen, both free projects deleted at once (the daily snapshot on both Drives plus the restore runbook covers the backend being lost).

## Reference frame analysis (`doc/ui`)

Three videos were split into keyframes and analyzed frame by frame.

**Login / Sign up (53 frames, 8.3 s at 30 fps)**: white header with logo above a charcoal card joined by an S curve (radius ~40) that flips sides with the mode. Segmented toggle ~345×42, pill half width, under damped spring (damping 11, stiffness 180, mass 0.8) overshooting ~60 px past the track; the label that becomes inactive drops in on its own spring. Fields are underline style; Email and Password persist and spring on translateY with a ~30 ms cascade; Username and Confirm password fade in place. Button springs on translateY with its label lagging ~100 ms and a color crossfade; the card flashes on tap (60 ms up, 180 ms down). Login mode adds a footer with a switch.

**"Passcode" (44 frames)**: actually an OTP sheet, not a keypad. Dark sheet, four 64 px boxes radius 14, digits pop in with a top highlight, a clockwise border trace (~4 frames) with inner glow and halo, text fades out, boxes jostle (±3 to 6°) and stack into one card on a spring, a spark grows into a checkmark, glow dims and the card scales to 0.9, then the screen exits. F2H adds the keypad and an error shake and recolors to blue.

**Admin approval (64 frames)**: white sheet inset 20 px, 28 px corners, over a dimmed scrim; sky blue header icons and title; pale blue callout; two dashed grey rows; full width sky blue button with a 4 px darker bottom strip. On tap the button grows into a full panel (~15 frames, ease out), shows a title with a dashed placeholder card and a Stop control, then a dot grows into a blurred circle and a radial white wipe reveals the success screen with a bold title, a 3D wobbling card and a Done button; two cards fan out behind it at the end.

**Onboarding (`working.md`)**: draggable cards, swipe left or right until the login screen; warm text colors (orange, yellow, red) on these cards only, as an explicit exception to the blue and white theme.

**Logo**: white bear with a royal blue cap on a royal blue field; primary `#2F5BEA` derived from it.

## External critique trail

A fresh model reviewed the first draft and found 13 issues; every one is resolved in the child specs:

1. Account squatting with open signup → public signup disabled, invite codes, Admin seeded out of band.
2. Pending device could read wraps from `profiles` → separate `key_material` table gated by `is_approved_device()` and active status; INSERT only through functions.
3. Oversight could be blinded by overwriting `mk_wrapped_admin` → `mk_verifier`, verified on the Admin phone before approval; updates audited.
4. Two conflicting recovery secrets → one 32 byte recovery seed, X25519 key derived by HKDF, Admin MK sealed to the same key.
5. Unauthenticated chunk header, chunk swapping between versions → fixed header in chunk 0 AAD, AAD includes blob id, version, index, total, final flag; fresh DEK per upload; Drive `sha256Checksum` compared to the client hash.
6. Sealed box underspecified → explicit construction.
7. PIN wrap and biometrics in Expo Go → scrypt N=2^14, counter in SecureStore, biometric fallback without `requireAuthentication` in Expo Go.
8. Device gate details → `SECURITY DEFINER STABLE` helper, hex hash, partial unique pending index, idempotent registration by nonce, profile activation in `approve-device`, Realtime publication.
9. Drive path unproven → spike moved to Phase 0; chunk reads via byte ranges; session URI expiry noted.
10. Dual write partial failure → `drive-upload-complete` carries the item ciphertext; orphan sweep; budgeted streaming re copy.
11. Free tier → GitHub Actions keep alive; no Supabase emails; pg_net timeout raised.
12. Expo Go → push token requires EAS `projectId` in Phase 4; random values polyfill before `@noble`; deep link scheme per environment.
13. Missing values → HKDF salts, device salt size, password change, version conflict rule, backup schema, auto lock range; push token commit before notify-admin.

Medium confidence facts to confirm during the build: Drive resumable PUTs without Authorization header; current Supabase free tier limits; exact Expo Go module bundle for SDK 57.

## Drive spike result

_Pending. Record here: date, whether a chunked PUT to a Drive resumable session URI succeeded without an Authorization header, and the chosen upload path (direct or proxy)._
