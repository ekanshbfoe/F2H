# Verify: App lock · spec 0002 · updated 2026-10-08
_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Log in on an approved phone with no PIN → Set PIN appears before Home → AC-1
- [ ] Set PIN: enter `123456` → refused with the straight run message; `000000` → refused as repeated → AC-15
- [x] Set PIN: two different PINs → shake, clear, back to the first step; a matching pair → Home, `f2h.lock_owner` is this user → AC-1
- [x] Kill the app, turn Wi-Fi off, reopen → the Unlock gate shows first, offline; the right PIN opens Home with a moving progress bar, about 1.5 s on the LAVA LXX503 → AC-2, AC-13
- [x] Background 59 s then return → still open; background 61 s (default 1 min) → the Unlock gate over Home, Home still there after the PIN → AC-3
- [x] Home → pick "15 s"; kill and reopen → the chip still says "15 s"; background 16 s → locked → AC-8
- [ ] Home → "Lock now" → the Unlock gate at once; the Locked badge until the PIN → AC-8
- [ ] Wrong PIN 4 times → shake and the tries left line; 5th → "Try again in 0:30" with the pad disabled → AC-4
- [ ] Kill the app during the countdown and reopen → the countdown resumes with the time that was left, not from zero → AC-4
- [ ] During a wait move the phone clock forward 1 hour → the countdown keeps counting the same seconds → AC-4
- [ ] Wrong PIN 10 times → the Wiped screen with the "Too many wrong PINs" copy; in the dashboard the device row is `revoked` and `audit_log` has `device.self_revoke` for it; login → the waiting screen → AC-5
- [ ] Unlock → "Forgot your PIN?" → "Keep trying" leaves the gate in place; "Wipe this phone" → the Wiped screen with the "PIN forgotten" copy → AC-6
- [ ] Home → Change PIN: a wrong current PIN → message and it counts as a miss; the right one, then a new PIN twice → Done; Lock now → the old PIN fails, the new one opens → AC-7
- [ ] Change PIN: with 4 misses stored, a wrong current PIN → the phone locks and shows the countdown → AC-7, AC-4
- [ ] Open the app switcher on either platform → the mascot overlay hides the content; on Android a screenshot is blocked on Home and on the recovery kit screen → AC-9
- [ ] Admin sets the device row to `revoked` in the dashboard; the phone comes to the foreground → the Wiped screen with the "Access removed" copy → AC-10
- [ ] Call an Edge Function from a revoked device while unlocked (for example Change password) → 403 `device_not_approved` → the Wiped screen → AC-10
- [ ] Let the session expire (or clear the AsyncStorage session) and unlock → back to login, no wipe, the device token still present → AC-2, AC-10
- [ ] Member A signs out; member B logs in on the same phone → Set PIN; A's wrap, owner and attempts are gone; B's misses start at zero → AC-14
- [ ] TalkBack or VoiceOver: each pad key reads its digit or "Delete", the boxes announce "n of 6 digits entered"; a Bluetooth keyboard types digits → AC-11
- [ ] Dev gallery → "Time one PIN unlock" on the LAVA LXX503 → record the ms in the spec Follow-up → AC-13

## Commands
- [x] `npm test -- src/features/lock src/components/lock src/app` → lock model, api, Unlock screen, PinEntry and boot suites green → AC-12, AC-16
- [x] `npx supabase db query --linked -f supabase/tests/database/0003_app_lock.test.sql` (pgTAP enabled, the file ending with `select num_failed()`) → 0 failed → AC-5 (server part)
- [x] `npm run typecheck && npm run lint` → clean

## Value sourcing checks
- [ ] PIN never leaves the phone: watch the network tab or function logs while setting and unlocking → no request carries digits → invariant
- [ ] Wrong owner: set `f2h.lock_owner` to another id (dev tool) → the right PIN answers "wrong PIN" → AC-14
- [ ] Attempt entry written before the derivation: kill the app the instant after the sixth digit → on reopen the miss count went up by one → AC-4
- [x] Timeout source: with no `f2h.lock_timeout_ms` stored the lock fires after 60 s → AC-3
- [ ] Background marker: an `inactive` blip (notification shade) under the timeout never locks → AC-3

## Acceptance-criteria coverage
- AC-1 set PIN before Home · AC-2 offline unlock first · AC-3 timeout lock keeps the route · AC-4 backoff, resume, clock · AC-5 tenth miss wipes and self revokes · AC-6 forgot PIN · AC-7 change PIN · AC-8 Lock now and timeout · AC-9 overlay and screenshot block · AC-10 revoke guard and status read · AC-11 accessibility · AC-12 jest · AC-13 N=2^7 and bench · AC-14 sign out forgets · AC-15 PIN rules · AC-16 generation guard
