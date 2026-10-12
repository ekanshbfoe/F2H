# 0007. Onboarding and polish

**Status**: In Progress
**Date**: 2026-10-12
**Mode**: FEATURE · Beta tier (project default) · Tracer Bullet
**Decided by**: Claude during the autonomous run the engineer authorized on 2026-10-12, from the engineer's own onboarding brief (`doc/ui/Onboarding/working.md`: drag cards left or right until the login screen, colourful orange, yellow and red text, not the blue and white theme).

## Summary

A first launch shows four draggable cards that explain F2H in warm colours; dragging the last card away (or tapping Skip) lands on login and never shows the deck again on that phone. Home gains a vault summary with live counts. A dependency audit removes what the app no longer imports.

## Requirements

**Acceptance criteria**:
- **AC-1**: On a phone that has never finished onboarding and has no session, boot opens the onboarding deck instead of login. A phone that finished it, or that has a session or a PIN, never sees it.
- **AC-2**: The deck has four cards in this order: "Your family's vault", "Encrypted before it leaves your phone", "The Admin approves every phone", "Kept on two Google Drives". Titles use the warm palette (orange, yellow, red) and only this screen uses it. Each card can be dragged left or right (the existing `CardDeck`); the last one leads to login. A Skip button does the same at any time; a dot row shows the position and is announced to screen readers.
- **AC-3**: Finishing or skipping stores `f2h.onboarded` in AsyncStorage (not a secret); `wipeLocalState` keeps it, so a wiped phone goes straight to login.
- **AC-4**: Home's "Your vault" card shows the number of contacts, credentials and files once each list has loaded on this phone, and nothing (not a zero) before that.
- **AC-5**: Every dependency in `package.json` is imported somewhere in `src/`, `scripts/` or the Expo config, or is a known peer, plugin or build tool; anything else is removed with `npm uninstall`, and `npx expo-doctor` shows no new failure.
- **AC-6**: Jest covers the boot choice, the deck (swipe, Skip, the flag) and the Home counts.

## Decision

A route `/onboarding` built on the existing `CardDeck`, gated by an AsyncStorage flag read during boot; Home reads the three vault stores for its counts.

**Calls made here (recommended items):**
- **AsyncStorage flag, kept on wipe.** Onboarding is a welcome, not a secret; showing it again after a PIN wipe would only slow the person down.
- **Four cards.** One idea each, matching the umbrella's copy plan.
- **Counts from the in memory stores only.** No extra request and no number before the lists were opened on this phone.

## Feature design

**Value sourcing**:
| Value | Source |
|---|---|
| show onboarding | `AppKeys.onboarded` absent and boot would route to `login` |
| card copy | fixed in `src/features/onboarding/cards.ts` |
| title colours | `warmOrange`, `warmYellow`, `warmRed` tokens (onboarding only, per the design spec) |
| Home counts | `Object.keys(store.items).length` when `store.status === 'ready'` |

## Build plan

1. [x] `AppKeys.onboarded`, the `onboarding` boot route, cards and the deck screen; jest, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-6**.
2. [x] Home vault counts; jest, satisfies **AC-4**, **AC-6**.
3. [x] Dependency audit and removals, satisfies **AC-5**.

## Implementation notes (2026-10-12)

- **Route**: a plain `/onboarding` route rather than a `(onboarding)` group, because the typed route list of the engineer's running dev server names group index routes differently from a fresh server.
- **Contrast**: the warm titles sit on charcoal cards (`colors.charcoal`), so orange, yellow and red all stay readable; on white, yellow would fail contrast.
- **Dependency audit (AC-5)**: every dependency is imported, or is a peer the toolchain needs (`expo-font` for the Google fonts loader and the router, `expo-system-ui`, `react-dom` for web, `react-native-screens` for the router, `react-native-worklets` for Reanimated 4). Nothing was removed. `expo-doctor` reported one failure, `newArchEnabled` in `app.json` (not part of the SDK 57 schema, where the New Architecture is the only option); the field was removed and `expo-doctor` now passes 21 of 21.

## Consequences

**Positive**: a first time family member understands the approval wait before they meet it.
**Negative**: none of note; the flag is per phone.

## Rationale

The engineer's brief fixed the interaction and the palette; the design spec already holds the `CardDeck` primitive and the warm tokens. The remaining calls are local and recorded above.
