# 0002. App lock: six digit PIN with device secret, backoff and wipe

**Date**: 2026-10-08
**Status**: In Progress

## Summary

Once a phone is approved, the member sets a six digit PIN. The vault key stays wrapped (encrypted) on the phone under that PIN and a random device secret kept in the phone's keystore, so the password is never typed again day to day. The app locks on every cold start and after a background timeout the member picks, four wrong PINs are free, the fifth to ninth add growing waits, and the tenth wipes the phone's key material so it must be approved again. Biometrics and a forgotten PIN rescue are left out of this slice on purpose. A cross check by a second model added the owner binding, the wipe details, the revoke rules and the race protections recorded below.

## Requirements

**User stories**:
- As a member, I want to open my vault with a six digit PIN so that I never type the long password on my phone again.
- As a member, I want the vault to lock itself when I put the phone down so that someone picking it up sees nothing.
- As the Admin, I want a lost phone to wipe its own key material after ten wrong PINs so that a thief cannot keep guessing.

**Acceptance criteria**:
- **AC-1**: After approval (member) or the recovery kit (Admin), and on the next login of an already approved phone with no PIN for this account, the Set PIN screen appears before Home: six digits entered twice on a numeric pad with six glow boxes; a mismatch shakes, clears and restarts; a match stores `mk_wrapped_local` bound to the user id and opens Home.
- **AC-2**: On a cold start with a local wrap present, the Unlock screen appears first and works offline; the correct PIN restores the Master Key within about 1.5 s on the reference phone, with a visibly animated progress state and no frozen UI; the session and device status are checked only after the unlock, and a missing session clears the lock keys and goes to login.
- **AC-3**: The app locks when it returns from the background after more than the chosen timeout (15 s, 60 s default, 5 min, 15 min); locking zeroes the Master Key and clears every decrypted item from memory, keeping only the route; the Unlock screen is a modal over that route, and screens decrypt again after the PIN.
- **AC-4**: Wrong PIN handling: misses 1 to 4 shake and allow an immediate retry; misses 5 to 9 impose waits of 30 s, 1 min, 2 min, 5 min and 15 min with a visible countdown driven by monotonic time; the miss count and the remaining wait are one SecureStore entry written before the derivation runs and survive a restart, which resumes the full remaining wait; neither a clock change nor an app kill shortens a wait.
- **AC-5**: The tenth wrong PIN (on Unlock or on Change PIN) wipes the local key material, the device token and the device identity, calls `revoke_my_device` on a best effort basis first, shows the Wiped screen with the `pin_limit` copy, and returns to login; a stored count of ten found on boot wipes too.
- **AC-6**: "Forgot your PIN?" on the Unlock screen performs the same wipe after an explicit confirmation, with the `forgot` copy.
- **AC-7**: Change PIN (from Home) asks for the current PIN through the same attempt gate as Unlock, then the new PIN twice, and rewraps the Master Key without rotating the salt or the device secret; the old PIN stops working at once.
- **AC-8**: Home offers "Lock now" (locks immediately) and the timeout picker; the choice persists across restarts.
- **AC-9**: From boot, on both platforms, a blur overlay hides the content whenever the app is not active, and on Android screenshots and the recents thumbnail are blocked on every screen, the recovery kit included.
- **AC-10**: While the session is in the ready phase, a 403 `device_not_approved` from any request wipes the phone with the `revoked` copy; a plain 401 never wipes. Each unlock and each return to the foreground also reads the device status, and a `revoked`, `rejected` or `expired` status wipes the same way.
- **AC-11**: The PIN pad is accessible: every key has a label and a 44 pt target, the boxes announce the entered count, and a hardware keyboard can type digits through a hidden input.
- **AC-12**: Jest covers the lock state machine, the backoff schedule, the restart resume, the wipe at ten, the owner binding, the timeout decision, the generation guard and the PIN wrap round trip against `src/crypto` vectors.
- **AC-13**: The PIN derivation uses `SCRYPT_DEFAULT` (N=2^7); the three SecureStore reads an unlock needs run in parallel; the dev gallery bench records the unlock time on the reference phone in the spec's Follow-up.
- **AC-14**: Sign out forgets the PIN: it deletes the wrap, the attempt entry and the owner, keeps the device identity, and the next login shows Set PIN; a wrap whose owner is not the signed in user is treated as absent.
- **AC-15**: A new PIN is refused when all six digits are the same or when they form a straight ascending or descending run.
- **AC-16**: A lock that fires while an unlock or a vault write is in flight never produces a write with a zeroed key: operations work on a copy of the key and abort when the lock generation changed; a stale unlock result is dropped.

## Decision

**Chosen option**: Option 1: PIN plus device secret wraps the Master Key, true lock.

The phone keeps `mk_wrapped_local` under a key derived from the PIN and the device secret, bound to the owning user id; locking zeroes the Master Key and clears decrypted items, unlocking re derives it; sign out forgets the PIN; biometrics are deferred to an EAS build.

**Implementation skills**: none.

## Feature design

**Data model sketch** (local only, plus one owner RPC on the server):

| Store | Key | Type | Purpose |
|---|---|---|---|
| SecureStore | `f2h.device_secret` | 32 bytes, base64 | generated once per install, second factor of the wrap; accessibility `WHEN_UNLOCKED_THIS_DEVICE_ONLY` |
| SecureStore | `f2h.device_salt` | 16 bytes, base64 | scrypt salt for the PIN; never rotated by Change PIN |
| SecureStore | `f2h.mk_wrapped_local` | AEAD wire, base64 | the Master Key under `wrapKey = hkdf(scrypt(PIN) ‖ device_secret)`, AAD = the owner's user id; same accessibility |
| SecureStore | `f2h.lock_owner` | uuid | the user id the wrap belongs to |
| SecureStore | `f2h.lock_attempts` | JSON `{ failures: number, remainingMs: number }` | one entry, written before every derivation; `remainingMs` is the wait still owed |
| AsyncStorage | `f2h.lock_timeout_ms` | number | 15000, 60000 (default), 300000, 900000; survives a wipe |
| AsyncStorage | `f2h.background_at` | epoch ms | when the app last went to the background; cleared by a wipe |

`f2h.device_token`, `f2h.device_id` and `f2h.registration_nonce` from spec 0001 are untouched by locking and by sign out, and removed by a wipe. The crypto spec's local wrap used the literal `"local"` as AAD; this spec binds it to the user id instead (recorded in Follow-up for the crypto spec).

Server addition: `revoke_my_device(p_device_id)` RPC (migration 0011): the owner, proven by the current device header, moves its own `approved` device to `revoked` and writes `audit_log` `device.self_revoke`. Called best effort before a local wipe.

**State transitions** (lock store, in memory, derived from SecureStore on boot):
- `no_pin` (approved device, no wrap for this owner) → `setting` (Set PIN) → `unlocked`
- `unlocked` → `locked` on cold start, timeout, Lock now; locking bumps the lock generation
- `locked` → `unlocked` on a correct PIN whose generation still matches; `locked` → `cooling_down` after misses 5 to 9 until the remaining wait is spent; `cooling_down` → `locked` when the wait ends
- any state → `wiped` on miss 10, Forgot PIN, a 403 `device_not_approved` in the ready phase, or a closed device status; `wiped` → login
- sign out → `no_pin` for the next account (wrap, attempts and owner deleted; identity kept)
- Set PIN and Change PIN write the new wrap only after the new derivation succeeds; a kill before that leaves the previous wrap or none, never a half written one.

**Backoff schedule** (miss number → wait before the next attempt): 1 to 4 → none; 5 → 30 s; 6 → 60 s; 7 → 2 min; 8 → 5 min; 9 → 15 min; 10 → wipe.

**Attempt gate** (shared by Unlock and Change PIN): on boot read `f2h.lock_attempts`; `failures >= 10` wipes at once; `remainingMs > 0` enters `cooling_down` and counts it down with a monotonic clock, persisting the remainder on every tick of one second and on background. On a guess: write `{ failures: failures + 1, remainingMs: scheduleFor(failures + 1) }` first, then derive; on success write `{ failures: 0, remainingMs: 0 }`; on failure keep the pre written entry (so a kill mid derivation costs the guess). A pre written tenth miss wipes only after the derivation fails; a correct tenth guess resets.

**Module surface** (everything is on the phone, under `src/features/lock/`, screens in `screens/` with one line route files):
| Function | Inputs | Outputs | Notes |
|---|---|---|---|
| `setPin(pin)` | 6 digit string, Master Key in memory, user id | writes wrap, owner, salt and secret if absent | refuses AC-15 patterns before deriving |
| `unlock(pin)` | 6 digit string | Master Key into the session store, or `wrong_pin` / `cooling_down(remainingMs)` / `wiped` | uses the attempt gate; drops the result if the lock generation changed |
| `changePin(current, next)` | two 6 digit strings | rewrapped `mk_wrapped_local` | current PIN through the attempt gate; salt and secret untouched |
| `lockNow()` | none | zeroes the Master Key, clears decrypted caches, bumps the generation, state `locked` | also used by the background timer |
| `wipe(reason)` | `pin_limit` / `forgot` / `revoked` | best effort `revoke_my_device`, then clears every `f2h.*` key and `background_at`, signs out, state `wiped` | reuses `wipeLocalState` from spec 0001 with the new reasons |
| `forgetPin()` | none | deletes wrap, attempts and owner | called by sign out |
| `withKey(fn)` | an operation needing the Master Key | runs `fn` on a copy of the key; aborts with `locked` if the generation changed before it commits | every vault write uses it |
| `useAutoLock()` | app state events | locks when `now - background_at > timeout`; on foreground also reads the device status | reads the timeout from AsyncStorage |
| `useRevokeGuard()` | fetch responses | calls `wipe('revoked')` on 403 `device_not_approved` while the phase is `ready` | installed once in the root layout; ignores 401 |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Set PIN, Unlock, Change PIN | PIN | numeric pad or hidden input on the phone, never sent anywhere |
| Set PIN | PIN acceptability | the AC-15 rules, evaluated on the phone |
| Set PIN | device secret, device salt | `src/crypto` (`localWrap.generateDeviceSecret`, `generateDeviceSalt`) once, SecureStore |
| Set PIN | Master Key to wrap, owner id | session store (approval or recovery kit, spec 0001) and the profile id |
| Unlock | wrap key, Master Key | `localWrap.deriveLocalWrapKey` with `SCRYPT_DEFAULT`, then `unwrapMkLocal` with AAD = owner id |
| Unlock | wait length | the backoff schedule above, indexed by `failures` |
| Unlock | countdown shown | `remainingMs` in `f2h.lock_attempts`, counted down with `performance.now()` |
| Boot | first screen | wrap for this owner present → Unlock; approved device without one → Set PIN after login; no device → login (spec 0001) |
| Auto lock | elapsed background time | `Date.now()` minus `f2h.background_at` |
| Auto lock | timeout | `f2h.lock_timeout_ms`, default 60000 |
| Foreground and unlock | device status | `devices.status` of the stored device id (own row readable) |
| Wipe | which keys to clear | the `SecureKeys` map in `src/services/secure-store.ts` plus `f2h.background_at` |
| Wiped screen | reason copy | the `wipe(reason)` argument |
| Revoke guard | trigger | HTTP 403 with body code `device_not_approved`, phase `ready` |
| Privacy overlay | when to show | `AppState` not `active`; Android screenshot block via `expo-screen-capture`, enabled at boot |
| Vault writes | key copy and abort decision | `withKey` and the lock generation counter |

**Key invariants**:
- The PIN, the wrap key and the Master Key never leave the phone; the only server effect of the lock is the best effort self revoke.
- `locked` means no Master Key, DEK or decrypted item bytes in memory.
- The attempt entry is written before any derivation and decreases only on a verified unlock; ten consecutive misses always wipe.
- A wrap only opens for the owner it was made for.
- One wrap at a time: Set PIN and Change PIN write the new wrap only after the new derivation succeeds; the salt and the device secret never rotate.
- A vault write never uses a key from a previous lock generation.

**Security model**: everything is on the phone and owned by whoever holds it. A rooted phone with the device secret extracted can brute force a six digit PIN offline in minutes (crypto spec, known limit), which is why the app side wipe exists; moving the clock cannot shorten a wait, and a rooted phone resetting the counter is accepted. A revoked device learns it on its next request or foreground and wipes. The self revoke RPC can only touch the caller's own device, proven by the device header.

**Configuration required**: none. New dependency: `expo-screen-capture` (bundled in Expo Go). Migration 0011 adds `revoke_my_device`.

**Critical test scenarios**:
- Happy path: approve a phone, set a PIN, kill the app, unlock offline with the PIN and land on Home with the vault readable, verifies **AC-1**, **AC-2**.
- Failure case: nine wrong PINs produce the schedule's waits, a restart mid wait resumes the full remainder, and the tenth wipes with a self revoke, verifies **AC-4**, **AC-5**.
- Auth/permission: the Admin revokes the phone; the next unlock succeeds locally, the foreground status read sees `revoked` and the phone wipes; a 401 from an expired session does not, verifies **AC-10**.
- Shared phone: member A signs out, member B logs in and sees Set PIN; A's wrap is gone and B's misses start at zero, verifies **AC-14**.
- Race: a timeout fires during a vault save; the save aborts with `locked` and nothing is written with a zeroed key, verifies **AC-16**.
- Timeout: background for 59 s then return keeps the vault open; 61 s locks it and the Unlock modal preserves the route, verifies **AC-3**.

## Build plan

Tracer bullet: the thin thread (set a PIN, lock, unlock) lands first through store, crypto and screens, then the brakes (backoff, wipe), then the triggers and the privacy layer. Screens live under `src/features/lock/screens/` with one line route files, which also starts paying down the review finding on spec 0001.

1. [x] Migration 0011 `revoke_my_device` with a pgTAP case; regenerate types, satisfies **AC-5** (server part).
2. [x] Lock store with the generation counter, the attempt gate entry, `setPin`, `unlock`, `lockNow`, `forgetPin`, `withKey` and `wipe` with reasons; the new `SecureKeys`; keychain accessibility; round trip tests against the `src/crypto` vectors, satisfies **AC-12**, **AC-13**, **AC-14**, **AC-16**.
3. [x] `PinPad` and `PinBoxes` on `GlowBox` with the hidden input, labels and the AC-15 rules, satisfies **AC-11**, **AC-15**.
4. [x] Set PIN screen and the handoff: approval, recovery kit and a PIN less approved login route there before Home; sign out calls `forgetPin`, satisfies **AC-1**, **AC-14**.
5. [x] Unlock screen as a modal with the Reanimated progress state; boot routing goes to Unlock first when a wrap exists and checks session and status after, satisfies **AC-2**.
6. [x] Backoff schedule, countdown, restart resume, the wipe on the tenth miss with the Wiped screen and its three copies, Forgot PIN, satisfies **AC-4**, **AC-5**, **AC-6**.
7. [x] Auto lock on app state with decrypted cache clearing, the timeout setting, Lock now, and the status read on foreground and unlock, satisfies **AC-3**, **AC-8**, **AC-10** (status part).
8. [x] Change PIN screen through the shared gate, satisfies **AC-7**.
9. [x] Privacy overlay from boot and the Android screenshot block, satisfies **AC-9**.
10. [x] Revoke guard on the shared fetch wrapper (403 `device_not_approved`, ready phase only), satisfies **AC-10**.
11. [x] Jest for the state machine, schedule, resume, owner binding, timeout and generation guard; a gallery bench entry for the unlock time, satisfies **AC-12**, **AC-13**.

## Consequences

**Positive**:
- The password is typed once per phone; daily use is a PIN, and a locked phone holds no key or plaintext.
- A lost phone stops being a risk after ten guesses without any server help, and tells the server when it can.
- The screens pattern (feature owned screens, thin routes) sets the shape the next features follow.

**Negative / tradeoffs**:
- About 1.3 s per unlock on the oldest phone; a forgotten PIN costs the Admin an approval.
- Screens re decrypt after every unlock, a small cost on the old phone.
- The miss counter is app enforced; a rooted phone can reset it (accepted in the crypto spec).
- No biometrics until an EAS build exists.

**Neutral**:
- The crypto spec's local wrap now uses the owner id as AAD and N=2^7; both drifts are recorded for the crypto spec.
- Expired or rejected states from spec 0001 and the lock's wipe share one wipe routine with more reasons.

## Follow-up

- [ ] Record the unlock time measured on the reference phone (LAVA LXX503) after task 11.
- [ ] Biometric unlock in an EAS build: the bio wrap from the crypto spec plus a `requireAuthentication` SecureStore entry.
- [ ] Update the crypto child spec's local wrap line: AAD = owner user id (was `"local"`) and N=2^7 (recorded in `kdf.ts` since 2026-10-07).
- [ ] The scope row's "Done when" mentions biometrics; `/scope` should move that to the deferred list.

## Rationale

The context, the options considered and the reasoning live in [rationale.md](rationale.md).
