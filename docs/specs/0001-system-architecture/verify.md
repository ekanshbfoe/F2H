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
