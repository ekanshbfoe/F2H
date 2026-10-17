# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-10-17

The first release: a complete family vault you can run yourself.

### Added
- Run your own copy: `SETUP.md` takes a fresh clone to an installed APK on your own Supabase, Google and Expo accounts, `npm run setup:backend` sets up a new Supabase project in one command, and the app id and EAS project come from `.env`. MIT license and a security policy.
- Vault home with Vault, Family and Settings tabs, swipe between pages, an account sheet from the avatar, and an onboarding card deck on first launch.
- Contacts: one encrypted list, import from the phone, swipe to delete, long press to pick several, delete all, and save picked contacts back into the phone's own contacts.
- Passwords: categories with your own names, a timed reveal, copy with a 30 second clipboard clear, and a generator.
- Files: encrypted upload to one or two Google Drives with verified downloads, a tall viewer sheet that shows images, text, PDFs, video and audio inside the app, open with another app, swipe or long press to delete.
- Admin: a sign in request pops up over any screen and ends on an All set card, members with a free text relation, read only and logged oversight of a member's vault, backups, device sign out, and the recovery kit.
- App lock: a 6 digit PIN on physical keys, attempt backoff and a wipe after 10 tries, auto lock in the background with a short grace for the file picker and Google sign in.
- Invite code sign up: a new member joins only with an 8 character code the Admin hands over in person, valid for 7 days and usable once (see spec 0001, account and device gate).
- Zero knowledge login: the password is stretched on the phone and split in two; only one half reaches Supabase Auth, the other half wraps the vault key and never leaves the phone.
- Device approval gate: a new phone registers with its model, OS, app version and approximate location, then waits on a live Waiting screen until the Admin approves it. Key material is unreadable on that phone until then. The Admin's first phone is approved on the spot.
- Admin recovery kit on first run: 24 words shown once and confirmed, the recovery public key and its fingerprint published for members to compare at sign up, the seed kept as an encrypted vault note.
- Admin screens: Approvals with a live list and a verified key check before the approve sheet, Members with invite codes as text and QR, and recovery grants for a member who forgot their password.
- Rejected and expired request screens that wipe local key material, an hourly expiry sweep for stale requests and invite codes, forgot password via an Admin grant, and change password with a fresh key wrap.
- Home shell with Admin quick actions, account settings and a sign out.
- Backend foundation: Postgres schema for the family vault, row level security with an approved device check, append only audit log, cron jobs, a devices webhook, shared Edge Function helpers, the Admin bootstrap script and a keep alive workflow (see spec 0001, data model and RLS).
- Crypto core: XChaCha20 Poly1305 envelope encryption, X25519 sealed box, password split, chunked file format, BIP39 recovery mnemonic, all pure JavaScript with committed test vectors (see spec 0001, crypto envelope).
- Design system and motion primitives from the reference videos, with a dev only component gallery (see spec 0001, design system and motion).

### Changed
- The scrypt cost for the password split and the PIN wrap is N=2^7 so a derivation stays near one second on an 8 year old 1 GB Android phone; the device approval gate and the Supabase password hash carry the rest of the protection.

### Fixed
- The app no longer crashes on start in Expo Go on Android: push notification support is loaded only where remote push exists.
- Opening Approvals while Home was watching the same table no longer crashes; every realtime subscriber gets its own channel.
- Login errors now say which call failed and with what status, instead of a generic connection message.
- Invite codes always have 8 characters: the generator used a 30 symbol alphabet against a 32 way modulo.

[Unreleased]: https://github.com/ekanshbfoe/F2H/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ekanshbfoe/F2H/releases/tag/v1.0.0
