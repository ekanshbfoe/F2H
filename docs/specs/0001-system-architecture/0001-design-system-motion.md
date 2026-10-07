# 0001 child: Design system and motion

Part of [0001 system architecture](index.md). Build spec for feature 3 (Design system & motion).

## Summary

A blue and white, lightly three dimensional look (soft shadows, raised cards, buttons with a darker bottom edge) built from plain React Native styles and a small set of tokens. The motion primitives copy what the reference videos do: a segmented toggle that overshoots on a spring, form fields that cascade, PIN boxes that glow and merge into a checkmark, a button that grows into a panel and reveals a success screen with a radial wipe, and a swipeable card deck for onboarding.

## Requirements

**Acceptance criteria**:
- **AC-1**: `src/theme/tokens.ts` exports colors, spacing (4 pt grid), radii (12/18/24/28), shadows (`raised`, `floating`, Android elevation equivalents), motion presets (`springSnappy`, `springOvershoot`, `springSoft`, `timingFast`, `timingReveal`), and typography scales; no component uses a literal color.
- **AC-2**: Poppins 400/500/600 load via `expo-font` before the splash hides; `ThemeProvider` exposes tokens through `useTheme()`.
- **AC-3**: `Surface`, `Card` (raised), `Button` (primary with 4 px bottom edge and press scale 0.97, secondary, danger, loading state), `TextField` (underline style, label, error, secure toggle), `Sheet` (inset 20, radius 28, scrim, drag to dismiss), `Callout`, `Row` (dashed variant, label left, value right), `Badge`, `Avatar` exist and are accessible (roles, labels, 44 pt targets).
- **AC-4**: Every primitive renders in the dev only gallery route `src/app/(dev)/gallery.tsx` (excluded from production via `__DEV__`).
- **AC-5**: `SegmentedToggle` animates the pill with `withSpring({damping: 11, stiffness: 180, mass: 0.8})`, allows overshoot past the track (`overflow: visible`), and drops the inactive label in on its own spring; `onChange` fires once per tap.
- **AC-6**: `CascadeList` animates children on `translateY` with a 30 ms stagger using the overshoot spring, and supports entering/exiting (`FadeIn`/`FadeOut`) for conditionally rendered children.
- **AC-7**: `MorphButton` grows from a button into a full panel in ~250 ms (`Easing.out(cubic)`), hosts a `pending` slot (title, dashed placeholder card, Stop control) and a `success` slot revealed by `RadialReveal` (circle scale 0 → 8 over ~300 ms); `GlowBox` draws a rounded box with a clockwise SVG border trace (`strokeDashoffset`, ~130 ms) and an inner glow, and supports `state ∈ {idle, filled, success, error}` where `error` shakes horizontally.
- **AC-8**: `CardDeck` pans with `Gesture.Pan`, rotates with drag (±12°), flies off past a velocity or distance threshold, springs back otherwise, and calls `onEmpty` after the last card.
- **AC-9**: Jest tests cover token integrity, `Button` press and disabled, `TextField` error, `SegmentedToggle` `onChange`, and `CardDeck` `onEmpty` (gesture handler test utils).

## Decision

`StyleSheet` + tokens, Reanimated 4, Gesture Handler, SVG; `@gorhom/bottom-sheet` is not used (custom `Sheet` keeps the dependency count low); Skia is not used unless a glow cannot be done with shadows.

**Implementation skills**: none.

## Feature design

**Tokens**:
- Colors: `primary #2F5BEA`, `primaryDark #1E3FB8`, `sky #4FB3EE`, `skyTint #E6F4FD`, `surface #FFFFFF`, `canvas #F5F8FF`, `ink #14181F`, `muted #6B7280`, `line #E5E9F2`, `success #22C55E`, `danger #EF4444`, `warnOrange #FF7A1A`, `warnYellow #FFC53D`, `warnRed #F0443C` (the last three only on onboarding).
- Shadows: `raised`: `shadowColor #14287A, opacity 0.10, radius 16, offset (0, 6)`, elevation 4; `floating`: opacity 0.16, radius 24, offset (0, 12), elevation 8.
- Motion: `springOvershoot {damping 11, stiffness 180, mass 0.8}`, `springSnappy {damping 14, stiffness 180}`, `springSoft {damping 18, stiffness 120}`, `timingFast 250 ms Easing.out(cubic)`, `timingReveal 300 ms Easing.bezier(0.4, 0, 0.2, 1)`.
- Typography: Poppins; `title 24/600`, `heading 20/600`, `label 15/500`, `body 14/400`, `caption 13/400`.

**Component contracts** (props sketch):
- `Button {variant, size, loading, disabled, onPress, children}`.
- `TextField {label, value, onChangeText, error, secure, keyboardType, autoComplete}`.
- `SegmentedToggle {options: [left, right], value, onChange}`.
- `Sheet {open, onClose, title, left?: back, right?: close, children}`.
- `MorphButton {state: idle|pending|success|error, label, pending, success, onPress, onStop}`.
- `GlowBox {value, state, size}` and `PinBoxes {length: 4|6, filled, state}` (PinBoxes lives in the lock feature but uses GlowBox).
- `CardDeck {cards, renderCard, onSwipe, onEmpty}`.

**Reference motion mapping**: see the frame analysis in `rationale.md`; the reference dark theme is recolored to blue and white; onboarding cards use the warm palette only.

**Value sourcing**: all sizes come from tokens; screen width from `useWindowDimensions`; the pill width is half the measured track width.

**Critical test scenarios**: AC-9 list.

## Build plan

1. Tokens, fonts, `ThemeProvider`, `useTheme`, satisfies **AC-1**, **AC-2**.
2. `Surface`, `Card`, `Button`, satisfies **AC-3** (part).
3. `TextField`, satisfies **AC-3** (part).
4. `Sheet`, `Callout`, `Row`, `Badge`, `Avatar`, satisfies **AC-3**.
5. Motion presets module, satisfies **AC-1** (motion part).
6. `SegmentedToggle`, satisfies **AC-5**.
7. `CascadeList`, satisfies **AC-6**.
8. `MorphButton` + `RadialReveal`, satisfies **AC-7** (part).
9. `GlowBox` with border trace and states, satisfies **AC-7**.
10. `CardDeck`, satisfies **AC-8**.
11. Dev gallery route, satisfies **AC-4**.
12. Tests, satisfies **AC-9**.

## Consequences

**Positive**: zero runtime styling cost; every motion is a reusable primitive; screens stay thin.
**Negative**: a custom `Sheet` means writing drag to dismiss by hand; SVG border traces cost a little more than a static border.
**Neutral**: dark mode is deferred; tokens are structured to add it later.
