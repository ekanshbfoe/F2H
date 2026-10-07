# F2H design direction

`source: reference frames in doc/ui (three videos) plus the bear logo`
`tokens: src/theme/tokens.ts` (the only place values live; this file is art direction)

## Character

Calm, trustworthy, a little playful. White surfaces on a very light blue canvas, one strong brand blue, soft long shadows that make cards feel lifted (2.5D), and buttons with a darker bottom edge you could press. Poppins everywhere: semibold titles, medium labels, regular body. Motion is springy and quick: things overshoot slightly and settle, nothing drifts.

The mascot is a white bear in a blue cap. The app should feel like it: friendly, solid, private.

## Build mandate

- Every screen is a finished product surface: brand, real copy, hierarchy, and all states (loading, empty, error). No lone form on a blank page.
- Depth comes from `shadows.raised` on cards and the `primaryDark` bottom edge on primary buttons, not from borders. Hairlines (`colors.line`) only separate rows and underline text fields.
- Blue and white only. The warm palette (`warmOrange`, `warmYellow`, `warmRed`) is reserved for the onboarding cards, as the owner asked, and must not appear elsewhere.
- Corners are generous: cards 24 to 28, buttons and rows 18, fields have no box at all (underline style from the login reference).
- Motion presets are tokens (`motion.*`). Use `springOvershoot` for the segmented toggle and cascading fields, `springSoft` for sheets, `timingFast` for the button morph, `timingReveal` for the radial reveal. Respect reduced motion: cut springs to timing and skip decorative traces.
- Dark mode is deferred; tokens are flat so a dark set can be added later without touching components.

## Composition rules

- Screens: canvas background, 20 px side gutters, content stacks with `spacing.lg` rhythm, one title per screen.
- Sheets: white, inset 20 px from the edges, radius 28, a grab handle, header with back (left) and close (right) in `sky`.
- Lists: `Card` per item or `Row` groups inside one `Card`; dashed rows for placeholders and pending states.
- Forms: `TextField` underline style with the label above; a single full width primary `Button` at the bottom.
- Feedback: `Callout` in `skyTint` for explanations, `Badge` for statuses, `GlowBox` success and error motion for confirmations.

## Do's and Don'ts

- Do use tokens for every color, size, radius, shadow, duration.
- Do keep touch targets at least 44 pt.
- Do pair every color signal with text or an icon.
- Don't add borders to cards, don't use pure black, don't use emoji as icons, don't animate without a token preset.
