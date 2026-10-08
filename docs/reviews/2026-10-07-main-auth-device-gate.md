# Review, main (auth & device gate slice, 3d15704..HEAD), 2026-10-07

**Reviewed by**: claude-opus-5-5 (fresh reviewer context; author on a separate session)
**Scope**: 56 files, branch vs base (main, merge base 3d15704, committed range); re-review of the fix range 4e84ebe..HEAD (19 files, commits 7820694, aa51fdc, 5e8bbe0, 7592370)
**Verdict**: Blocked (second re-review: the regression is fixed for cold start re-login but still happens after Sign out or a failed status read)

## Re-review 2 (fix range 7592370..HEAD, commit 69cfcd6), 2026-10-08

**New verdict**: Blocked.

`resumeExistingDevice()` fixes the cold start path. An install holding a token and an id reads its own row and resumes an approved or pending device without calling `register-device`. `registerDevice()` keeps a stored approval on `nonce_used` with status `approved`. The first run and reset-password changes are correct. Two paths still turn an approved phone into a new pending request and drop its approval, and the Admin lockout follows from either.

### 🔴 STILL OPEN (narrowed): approval lost after Sign out or a failed status read, `src/features/auth/api.ts` (`signOut`, `resumeExistingDevice`), `src/features/device/register.ts:89-101`
**Problem**:
1. **Sign out.** `signOut()` (Home, "Sign out") still calls `setDeviceToken(null)` but keeps the device id and the nonce. On the next login, `resumeExistingDevice()` finds no token and returns null. `registerDevice()` then gets `nonce_used` with status `approved`, but `hasToken` is false, so it deletes the nonce and the id and registers a fresh pending device. The approved row is orphaned. An Admin who taps Sign out cannot approve their own new phone, and nobody else can.
2. **Failed status read.** `resumeExistingDevice()` ignores the `error` of the `devices` select. A transient network or PostgREST failure gives `data === null` and is treated as "closed or unknown device": the token, the id and the nonce are deleted. The same orphaning and lockout follow from one flaky request.

**Why it matters**: The outcome is the same as the regression. A normal user action (Sign out) or a transient error permanently loses the device approval, and for the Admin it forces a fresh bootstrap.
**Suggested fix**: Treat the device token as a device credential that survives sign out. Clear it only on rejected, expired or revoked, or on a full wipe, and drop `setDeviceToken(null)` from `signOut()`. In `resumeExistingDevice()`, if the select returns an error, throw (show "could not reach the vault") instead of wiping. Wipe only when the row is visibly closed, or when it is missing while the query itself succeeded. Add tests for "sign out then sign in keeps the approved device" and "a status read error does not wipe identity".

### Other items in this range
| Item | Status | Reasoning |
|---|---|---|
| 🟠 Admin first run, rollback deletes a committed note | Resolved | An RPC error counts as success when `recovery_pubkey()` already returns this key (lost reply). The note is deleted only on a genuine failure, and the hint `secureSet` is non fatal. A test covers the lost reply. |
| 🟡 reset-password burns the grant on a failed write | Resolved | The grant is released (`consumed_at = null`) when the password or wrap write fails. The release result is not checked (Nit). |
| 🟠 Screens in `src/app/` | Open (deferred by the author) | Unchanged; not a regression. |
| 🟠 Handler tests and pgTAP | Open (deferred by the author) | Unchanged; not a regression. |

### New nit
- ⚪ `src/features/auth/api.ts` `resumeExistingDevice`: an approved row whose token was rotated elsewhere resumes as approved, and the unwrap then fails with `not_released` instead of re-registering. This is an edge case. Confirm the token with a header gated read (for example `current_device_id()`) if it matters.

## Re-review (fix range 4e84ebe..7592370)

**New verdict**: Blocked.

Both original Blockers are closed as written. Approve is now inert unless the wrap verifies, and the nonce is no longer readable or replayable into an approved token. The original Majors are resolved or partly resolved, except the two the author deferred. The Blocker 1 fix creates a new Blocker, though. `signIn` still calls `registerDevice()` on every password login, and the server now answers `nonce_used` for an approved row. The client then deletes the nonce and the device id, registers a fresh pending device, and overwrites the approved token in SecureStore. Today every cold start on an approved phone asks for the password (no PIN yet), so every re-login turns an approved phone into a new pending request. For the Admin this is a permanent lockout. The recovery key is already published, so auto approve no longer applies, and the only approved Admin device just lost its token. Nobody is left who can approve.

### 🔴 NEW: Re-login on an approved phone discards its approval (Admin lockout), `src/features/device/register.ts:89-94`, `supabase/functions/register-device/index.ts:29-38`, `src/features/auth/api.ts` (`signIn`)
**Problem**: The `nonce_used` 409 is returned for every non pending status, `approved` included, and the client treats it as "the old request is closed". It wipes the nonce and the id, then registers again. The `status` in the payload is ignored. `signOut()` also deletes the device token, so after a sign out the approved phone has no way to prove itself. The unit test `starts over with a fresh nonce` only covers `rejected`, and no test covers re-login on an approved device.
**Why it matters**: Every member needs a fresh Admin approval after every cold start. The Admin, after their first re-login, has no approved device left and cannot approve themselves or anyone else. The only way out is a fresh bootstrap.
**Suggested fix**: Keep the device token across sign out and cold start (it is a device credential, not a session secret). On login, if a stored token exists, check it first (the `x-f2h-device` header plus a select of the own row's status) and skip registration when it is approved. On the server, rotate an approved row's token only when the caller presents that row's current token (`findDevice(user.id, req)?.id === existing.id`), otherwise answer `nonce_used`. Have the client restart registration only when `status` is `rejected`, `expired` or `revoked`. Add tests for "re-login on an approved device stays approved" and "the Admin re-login keeps admin access".

### Status of the original findings
| Finding | Status | Reasoning |
|---|---|---|
| 🔴 Nonce replay gives an approved token | Resolved (see new Blocker) | Only pending rows rotate. 0010 revokes table SELECT and regrants every column except `registration_nonce` and `token_hash`. Realtime `postgres_changes` filters columns by the subscriber's column privileges, so payloads lose them too. Worth one live subscription check on the hosted project. |
| 🔴 Approve enabled on a failed check | Resolved | `MorphButton` now takes `disabled`, Approve is disabled unless `check === 'verified'`, and `decide('approve')` refuses otherwise. Reject stays available. |
| 🟠 Admin auto approve after a lost phone | Resolved | It now requires that `admin_recovery_pubkey` is null and that the Admin has no device row of any status. A concurrent double registration can still race before first run (Minor). |
| 🟠 Admin first run not atomic | Partially resolved | The note is now written before the RPC and secrets are zeroed in `finally`. But the `catch` deletes the note on any error, including an RPC that committed but whose response was lost, and a failed `secureSet` after a successful RPC. Both cases recreate the original stuck state (`already_initialized` with no seed note). Before deleting, check `family_config.admin_recovery_pubkey` (or `recovery_pubkey()`) and keep the note if the key was published. Move `secureSet` out of the rollback scope. |
| 🟠 Change password locks out on a failed wrap | Resolved | The wrap is computed first. A failed `key_material` write rolls the auth password back to the old secret, the error says whether the rollback worked, and a test covers it. A small window remains if the app dies between the two writes. That is acceptable, and the Admin path covers it. |
| 🟠 409 adopts another phone, Cancel dead end | Resolved | A request is resumed only when the server id equals the id stored on this install. Cancel calls `cancel_my_device` (owner, pending, must match the current device header, audited) before wiping. The RPC error is ignored, so if cancel fails the next login surfaces `pending_exists`, which is acceptable. |
| 🟠 Screens in `src/app/` | Open (deferred by the author) | Deliberately deferred; not a regression. |
| 🟠 No handler tests or pgTAP for the new RPCs | Open (deferred by the author) | Deliberately deferred; not a regression. It now also covers `cancel_my_device` and the 0010 column grants. The new Blocker is exactly the kind of handler and flow path these tests would catch. |

### Original minors and nits
Resolved: the expire-requests race, the reset-password claim, redeemGrant verifying the MK before persisting it, the findNoteByTag fallback, signUp zeroing the KEK, the strict UUID checks, the login log line and the README note. Still open: signup audit spam and the service key probe, key bytes handled outside `src/crypto/`, the morph label in the reject tone, and the invite byte count that differs from the spec.

### New minor and nit findings in the fix range
- 🟡 `supabase/functions/register-device/index.ts:60-74`: the first run auto approve check and insert are still not atomic, so two concurrent first registrations can both be approved.
- 🟡 `supabase/functions/reset-password/index.ts:34-56`: the grant is now claimed before the password and wrap writes, so a failed write burns the grant and the member needs a new one from the Admin. It fails safe, but surface it in the response or the copy.
- ⚪ `src/features/auth/api.ts` `signIn`: register failures are wrapped as `function_failed`, so the new `pending_exists` copy in `describeAuthError` is never shown. Map that code through.

## Summary
The slice delivers the whole account and device gate: invite signup, device registration with nonce idempotency, Realtime plus poll approval watch, the Admin recovery kit, approvals, recovery grants, reset and change password, and the server side functions and RPCs behind them. The server code is careful in many places (token hashing, a transactional `decide_device`, input caps, handlers that do not leak errors). Two problems break the gate itself. First, the nonce retry path in `register-device` hands out a fresh token for an already approved device to anyone who knows the nonce, and the nonce can be read by the account holder, so a password alone opens the vault. Second, Approve is never disabled when the AC-10 tamper check fails. Several non-atomic multi-step flows can also lock a user or the Admin out.

## Blockers

### 🔴 Password alone takes over an approved device through the nonce retry path, `supabase/functions/register-device/index.ts:19-29`
**Re-review status**: Resolved. Only pending rows rotate, and 0010 hides the nonce and token hash. The fix introduced the new Blocker described above.
**Problem**: When a request carries a `registration_nonce` that already exists for the user, the function rotates that row's token and returns the new token and its status, whatever the status is, including `approved`. The only proof asked for is the user JWT. The nonce is not secret on the server. `devices_select_own` (`0007_rls.sql:80`) lets the owner select every column of their own rows, `registration_nonce` included, with no device check, and Realtime `postgres_changes` sends full rows to the same subscriber. So an attacker with the member's password can do this from a fresh phone: sign in (the auth secret comes from the password), run `select registration_nonce from devices where status = 'approved'`, POST `register-device` with that nonce, and get back an approved device token. With that header the attacker passes `is_approved_device()`, reads `key_material`, and unwraps `mk_wrapped_pw` with the KEK derived from the same password. The same steps on the Admin account give the recovery note and then every vault. A side effect is that the real phone's token is rotated out and that phone is silently logged out.
**Why it matters**: This breaks the main promise of the spec ("a password alone never opens a vault", AC-6 and AC-12, and the critical scenario "second phone with the password stays pending and reads 0 key rows").
**Suggested fix**: Never issue a token for a non pending row on the nonce path. Return the existing id and status only, or allow rotation only when the caller already presents that row's current device token, or treat the nonce as a secret by storing only its hash and never exposing it through the select policy or Realtime. Also stop exposing `registration_nonce` and `token_hash` to clients (a column grant or a view for own rows), since Realtime ignores column grants. Add a function test proving that a second session that knows an approved nonce gets no token.

### 🔴 Approve stays enabled when the key material check fails or has not finished, `src/app/(admin)/approvals.tsx:151-156`
**Re-review status**: Resolved. Approve is disabled unless the check is verified, and `decide()` refuses otherwise.
**Problem**: The `MorphButton` "Approve" always calls `decide('approve')`. `MorphButton` has no disabled prop, and the screen shows the `tampered`, `no_key` and `checking` states as badges and callouts only. The Admin can approve a device whose `mk_wrapped_admin` does not verify, or before the check has run.
**Why it matters**: AC-10 states that "a failed check shows a tamper warning and disables Approve". This is the only point where the Admin proves that the member's escrowed key is genuine before the device is released. Approving a swapped wrap silently breaks recovery and oversight for that member.
**Suggested fix**: Add a `disabled` prop to `MorphButton` (or render a disabled `Button`) and enable Approve only when `check === 'verified'`. Keep Reject always available. Add a screen test asserting that Approve does nothing in the `tampered`, `no_key` and `checking` states.

## Major

### 🟠 Admin auto approve fires whenever no approved Admin device exists, not only on first run, `supabase/functions/register-device/index.ts:48-62`
**Re-review status**: Resolved. It now requires an unpublished recovery key and no Admin device row of any status. The concurrent first run race remains (Minor).
**Problem**: The rule is "the Admin and zero approved Admin devices". Once the Admin's phone is revoked (a lost phone) or expires, the next phone that signs in with the Admin password is approved on the spot. Two concurrent first registrations can also both be approved, because only pending rows are unique.
**Why it matters**: The Admin account holds the recovery note, which opens every vault. If the Admin's phone is lost and revoked, the Admin password alone becomes enough to take over the family. That contradicts the spec's Consequences ("losing the Admin phone and the paper kit means a fresh bootstrap").
**Suggested fix**: Only auto approve while `family_config.admin_recovery_pubkey is null` (true first run) and no Admin device of any status exists, and do the check and insert atomically (an RPC with a lock, or a partial unique index). Put recovery of a lost Admin phone behind the paper kit.

### 🟠 Admin first run is not atomic and cannot be retried, `src/features/keyring/admin-recovery.ts:48-64`
**Re-review status**: Partially resolved. The note is written first and secrets are zeroed, but the rollback deletes the note even when the RPC committed (lost response, or a failed `secureSet`), which recreates the stuck state.
**Problem**: `admin_first_run` publishes the recovery key and inserts the Admin's `key_material` before the recovery seed is stored as a vault note. If `createNoteItem` fails (network, RLS) or the app dies in between, the retry in `recovery-kit.tsx:50-60` calls `admin_first_run` again and gets `already_initialized` forever. On the next boot `adminNeedsFirstRun` is false, so the Admin lands on Home with no recovery note. `loadRecoverySecretKey` then returns null, and approvals and grants show "Recovery key unavailable" with no in app way to re-import the seed from the 24 words. Also, `mk` and `pair.secretKey` are not zeroed on the throw path.
**Why it matters**: After a flaky network on day one, the family's only Admin cannot approve anyone.
**Suggested fix**: Write the vault note first (the MK can be created client side before the RPC), or make the RPC idempotent for the same public key, or add an "import from 24 words" path that rebuilds the note when the published key matches. Zero `mk` and the derived secret in a `finally`.

### 🟠 Change password updates the auth password before the wrap, so one failed write locks the member out, `src/features/auth/api.ts:282-293`
**Re-review status**: Resolved. A failed wrap write rolls the auth password back, with a test.
**Problem**: `auth.updateUser` commits the new auth secret, and only then is `mk_wrapped_pw` rewritten. If the `key_material` update fails (network, the device was just revoked, RLS), the new password authenticates but its KEK cannot unwrap the old wrap (verifier or bad_wrap error), and the old password no longer authenticates. Neither password opens the vault.
**Why it matters**: Without an Admin recovery grant, a transient error turns into account lockout.
**Suggested fix**: Do both in one server step (a small function or RPC that updates the auth password and `mk_wrapped_pw` together and rolls back on failure, like `reset-password` but tied to the current session). At minimum, write the new wrap first (keeping the old one so it can be restored), then update auth, and roll back on failure.

### 🟠 A 409 `pending_exists` takes over another phone's request, and Cancel leaves a dead end, `src/features/device/register.ts:82-88`, `src/app/(auth)/waiting.tsx:247-252`
**Re-review status**: Resolved. Only this install's own id is resumed, and Cancel closes the server row through `cancel_my_device`.
**Problem**: A retry from the same install hits the nonce path first, so a 409 only happens for a different install (another phone, or this phone after a wipe). The client then saves the other phone's `device_id` and shows its model, location and IP as "this phone" on the Waiting screen, even though it holds no token for that row. If the Admin approves it, `completeApproval` fails with `not_released`. "Cancel this request" makes this happen on the same phone: `wipeLocalState` clears the nonce and token locally but leaves the server row pending. The next login gets a new nonce, a 409, and adopts the orphaned row, so the member is stuck for up to 24 h unless the Admin rejects it.
**Why it matters**: The member sees wrong device details and the Admin approves the wrong phone (the approval sheet shows the orphan's model). The Cancel button produces a state the user cannot recover from.
**Suggested fix**: Have Cancel call a function that marks the caller's pending row `expired` or `cancelled`, proven by its token. On a 409 from a different install, show "another phone is already waiting" and do not adopt the id. Only reuse the id when the stored `deviceId` matches.

### 🟠 Screens with logic live in `src/app/`, `src/app/(admin)/approvals.tsx`, `members.tsx`, `recovery-kit.tsx`, `src/app/(auth)/login.tsx`, `forgot.tsx`, `waiting.tsx`, `src/app/(app)/change-password.tsx`, `home.tsx`
**Re-review status**: Open, deferred by the author on purpose (not a regression).
**Problem**: AGENTS.md and cross child contract 9 say "`src/app/` holds routes only (thin wrappers)" and features own optional `screens/`. These files are full screens (115 to 312 lines) with state, effects, crypto key handling (`loadRecoverySecretKey`, `secret.fill(0)`) and API orchestration. `collectCoverageFrom` also excludes `src/app/**`, so this logic is outside coverage by construction.
**Why it matters**: The contract is marked "must not drift", and feature 7 (App lock) will build on these screens.
**Suggested fix**: Move each screen to `src/features/<name>/screens/` and keep the route files as one line re-exports.

### 🟠 The new server endpoints and RPCs have no tests, `supabase/functions/*/index.ts`, `supabase/migrations/0009_auth_rpcs.sql`
**Re-review status**: Open, deferred by the author on purpose (not a regression). It now also covers 0010 (`cancel_my_device`, the column grants).
**Problem**: Only `_shared` helpers are tested. There are no tests for the `signup` invite rules (AC-2: bad, expired or used code gives 403), the `register-device` nonce, 409 and auto approve branches, `approve-device` with a non Admin caller (403, a spec critical scenario), `reset-password` grant binding, `expire-requests`, or `decide_device`, `admin_first_run` and the `member_devices_view` filter in pgTAP. The approvals tamper gate also has no screen test. Both Blockers above sit in this untested code.
**Why it matters**: This security branching is exactly what the GA tier depends on.
**Suggested fix**: Add handler tests that mock `serviceClient` (the pattern already exists in `auth.test.ts`), pgTAP cases for the 0009 RPCs, and an approvals screen test.

## Minor

### 🟡 expire-requests can flip a just approved device to expired, `supabase/functions/expire-requests/index.ts:27-30`
**Problem**: The update filters only on `id in (...)` and does not repeat `status = 'pending'`. An approval that lands between the select and the update gets overwritten: the profile is active, the device is expired, and the phone wipes itself.
**Why it matters**: The window is narrow but the result is user visible and confusing.
**Suggested fix**: Add `.eq('status', 'pending')` to the update, or do it in one SQL statement with `returning`.

### 🟡 reset-password consumes the grant non atomically and ignores the consume error, `supabase/functions/reset-password/index.ts:33-60`
**Problem**: Check, password update, wrap update and consume are separate calls. Two concurrent redeems both pass, and a failed consume leaves a reusable grant. The "single use" invariant is not enforced by the database.
**Why it matters**: The spec states single use as an invariant.
**Suggested fix**: Claim the grant first with a conditional update (`consumed_at is null and expires_at > now()`, returning the row), then do the writes. Check every error.

### 🟡 redeemGrant overwrites the password wrap without verifying the unsealed MK, `src/features/auth/api.ts:323-334`
**Problem**: The MK from `mk_sealed_for_device` is not checked against `mk_verifier`, which the approved device can read, before `mk_wrapped_pw` is replaced. A wrong or substituted MK would be wrapped under the new password. The MK is also not zeroed if `reset-password` fails.
**Why it matters**: In a zero trust design, the client should prove a key before persisting it.
**Suggested fix**: Read `mk_verifier` and run `verifier.check` before calling the function. Zero `mk` on any throw.

### 🟡 findNoteByTag throws on the hint row instead of falling back, `src/features/vault/api.ts:58-62`
**Problem**: `decryptNote` on the hinted row is outside the try/catch that the scan uses. A stale or foreign hint id makes the Admin's recovery key look unavailable instead of falling through to the scan.
**Why it matters**: A stale hint would block approvals and grants even though the note exists.
**Suggested fix**: Wrap the hint path in the same try/catch.

### 🟡 Anonymous signup writes an audit row per bad attempt, with no rate limit, `supabase/functions/signup/index.ts:74`
**Problem**: Anyone with the anon key can grow `audit_log` without bound (the table is insert only, and even the service role cannot delete). `requireServiceCall` (`_shared/auth.ts:83-86`) also makes an outbound admin API probe for every unauthenticated hit on `notify-admin` and `expire-requests`.
**Why it matters**: This is cheap abuse of an append only table and of outbound calls.
**Suggested fix**: Rate limit or coalesce `signup.bad_invite` per email or IP. Cache a successful probe, or reject non JWT shaped bearers before probing.

### 🟡 Key bytes are handled outside `src/crypto/`, `src/features/device/register.ts:29-41`, `src/features/keyring/admin-recovery.ts:46-77`, `src/features/auth/api.ts:319-326`
**Problem**: Feature code base64 encodes the X25519 secret key and the recovery seed, derives keypairs and zeroes secrets itself. It calls `@/crypto`, but the rule is that only `src/crypto/` touches key bytes.
**Why it matters**: Spreading secret buffer lifetimes across features makes zeroing mistakes (several noted above) likely.
**Suggested fix**: Add crypto level helpers (for example `deviceKeyring.create/load/open`, `recoveryKit.fromSeed`) so features hold opaque handles.

### 🟡 signUp leaves a half finished state when the follow up sign in fails, `src/features/auth/api.ts:218-224`
**Problem**: The device token and id are stored, then `signInWithPassword` fails. `split.kek` is never zeroed and the user sees "network". A retry of signup then fails with `email_exists`, and login creates a second registration path.
**Why it matters**: A transient network error leaves a KEK in memory and a confusing retry path.
**Suggested fix**: Zero the KEK on failure and route to login with a message that the account was created.

## Nits
- ⚪ `src/app/(auth)/login.tsx:55`: `console.warn('auth failed', e)` logs the raw error object. AGENTS.md says to use the redacting logger.
- ⚪ `supabase/functions/approve-device/index.ts:18`, `reset-password/index.ts:25`: the `[0-9a-f-]{36}` id check accepts malformed ids. Reuse the strict `UUID` regex from `signup`.
- ⚪ `src/app/(admin)/approvals.tsx:153-155`: the morph button is labelled "Approve" while it is in the danger tone during a reject.
- ⚪ `README.md:45`: says there are "no secrets to set for this slice", but the spec's build plan notes that the cron needs the Vault secrets.
- ⚪ `supabase/migrations/0009_auth_rpcs.sql:83-91`: invite codes use 8 bytes mod 32 (40 bits, uniform), while the spec's value sourcing table says 5 bytes. This is fine but differs from the spec, so update the spec.

## Strengths
- `decide_device` locks the row (`for update`), checks the state machine, flips device and profile and writes the audit row in one transaction. `approve-device` maps its errors cleanly to 404 and 409.
- Device tokens are 32 random bytes, returned once and stored only as sha256. `parseDeviceInput` caps every field and validates the public key length. `handle()` never leaks internal error messages.
- The client fails closed on unwrap (`not_released`, `bad_wrap`, `verifier_failed`). The session store zeroes the KEK and MK on replace and reset. `expo-notifications` is loaded lazily so Expo Go on Android boots.

## Test coverage
Jest covers the client auth flows (password split use, pending vs approved, change password, grant redeem), device identity and registration, the approval watch (Realtime plus poll), the recovery kit draft and finish, and the `_shared` server helpers (auth guards, device row, geo, hash, push, errors). Not covered: every Edge Function handler (`signup`, `register-device`, `approve-device`, `reset-password`, `expire-requests`, `notify-admin`), the 0009 RPCs and view (no pgTAP added), the approvals screen gate (AC-10), the 409 and cancel paths, and the failure ordering of change password and first run. `src/app/**` is excluded from coverage, so all screen logic is untested by construction. Tests were not run in this review (read only).
