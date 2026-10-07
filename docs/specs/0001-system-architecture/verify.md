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
- [ ] `node scripts/bench-kdf.ts` → prints scrypt timings for N=2^9..2^14; the default N=2^10 under 20 ms on Node → AC-12
- [ ] `grep -rn "noble\|scure" src --include=*.ts --include=*.tsx -l | grep -v "^src/crypto"` → no file outside `src/crypto/` imports a crypto library → key invariant
- [ ] `node -e "const v=require('./src/crypto/__tests__/vectors.json'); console.log(v.scrypt[0].dk.slice(0,16), v.hkdf[0].okm.slice(0,16))"` → `fdbabe1c9d347200` and `3cb25f25faacd57a` (RFC 7914 and RFC 5869 published values) → AC-2

## UI / manual (Expo Go, boot screen → "Open component gallery" → "Crypto bench")
- [ ] Press "Run KDF benchmark": the button shows a spinner, then four rows N = 2^9 to 2^12 with millisecond timings and the UI stays responsive; copy the N = 2^10 number into the `SCRYPT_DEFAULT` comment in `src/crypto/kdf.ts` → AC-12
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
