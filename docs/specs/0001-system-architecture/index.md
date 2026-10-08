# 0001. F2H system architecture (umbrella)

**Date**: 2026-10-07
**Status**: In Progress

## Summary

F2H is a family vault for four people where every secret is encrypted on the phone before it reaches the cloud. This umbrella fixes the stack (Expo with Expo Router on the phone, Supabase for the database, login, realtime and server functions, two Google Drives for encrypted files) and the contracts every feature shares: the key hierarchy, the device approval gate, the wire formats, the request header that proves a device is approved, and the backup shape. Each child spec is a complete build spec for one of those areas. Build plans here are per child; this file holds only the cross child contracts.

## Structure

- [0001-crypto-envelope](0001-crypto-envelope.md): the key hierarchy, primitives, wire formats, password split, local PIN wrap, recovery seed. Supports every vault feature.
- [0001-account-and-device-gate](0001-account-and-device-gate.md): invite code signup, Admin bootstrap, device registration, approval relay, post approval key release, password reset. Supports Auth & device gate.
- [0001-data-model-rls](0001-data-model-rls.md): every table, the approved device RLS helper, policies, triggers, cron and webhooks, bootstrap script, keep alive. Supports Backend foundation.
- [0001-drive-redundancy](0001-drive-redundancy.md): Google account linking, dual resumable uploads, verified completion, downloads, delete, reconcile. Supports Files & Drive redundancy.
- [0001-admin-device-self-approval](0001-admin-device-self-approval.md): the Admin approves their own new phone with the paper recovery kit when no admin phone can tap Approve, plus a revoke of other admin phones and the last admin phone warning. Extends the device gate.
- [0001-design-system-motion](0001-design-system-motion.md): tokens, base components and the motion primitives reverse engineered from `doc/ui`. Supports Design system & motion and every screen.

## Requirements

**User stories**:
- As a family member, I want my contacts, credentials and files stored so that nobody but me (and the Admin in an emergency) can read them, even if the cloud is breached.
- As the Admin, I want to approve every new account and device from my own phone so that a password alone never opens a vault.
- As the family, we want every file kept on two Google Drives so that losing one account or the backend loses nothing.

**Acceptance criteria** (umbrella level, each child adds its own):
- **AC-1**: The repo boots in Expo Go on Android and iOS from `npx expo start` with no native module outside the Expo Go bundle.
- **AC-2**: The APK and the JS bundle contain only the Supabase URL and anon key; no Google secret, refresh token or service role key.
- **AC-3**: A member's rows are unreadable by any other member at the database layer (RLS), independent of app code.
- **AC-4**: A device without an approved device token cannot read any key material or vault rows.
- **AC-5**: Every file saved by the app exists as the same ciphertext on both Drives, verified by hash.

## Decision

**Chosen option**: Option 1 in `rationale.md`: Expo + Supabase + dual Google Drive with client side envelope encryption.

Expo (SDK 57, Expo Router, TypeScript strict) on the phone; Supabase free tier (Postgres with RLS, Auth, Realtime, Deno Edge Functions, Vault, pg_cron, Database Webhooks) as the only backend; two Google Drive accounts reached only through Edge Functions holding the refresh tokens; all cryptography in pure JavaScript (`@noble/*`) so it runs in Expo Go.

**Implementation skills**: none installed beyond the workflow suite. Follow up: `/audit` after scaffold to list any community skills added later.

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript strict (TS 6, Hermes) | One language across app, scripts and Edge Functions (Deno) |
| App framework | Expo SDK 57, React Native 0.86, Expo Router (routes in `src/app/`) | Mandated; Expo Go for development keeps RAM and setup minimal |
| State | Zustand (session, lock, sync) + TanStack Query (server data) | Small, no boilerplate |
| Forms | react-hook-form + zod | Typed validation, light |
| Styling | `StyleSheet` + tokens in `src/theme/` | Lightest option; no runtime CSS engine |
| Motion | react-native-reanimated 4 + react-native-gesture-handler + react-native-svg | Bundled in Expo Go; springs, border traces and radial reveals from the reference videos |
| Fonts | Poppins (`@expo-google-fonts/poppins`) | Matches the login reference |
| Crypto | `@noble/hashes`, `@noble/ciphers`, `@noble/curves`, `expo-crypto` randomness | Audited pure JS, swappable behind `src/crypto/` |
| Local secrets | `expo-secure-store` | Keychain / Keystore backed, works in Expo Go |
| Local cache | `expo-sqlite` (ciphertext only) | Read only offline later |
| Backend | Supabase free tier | Auth, RLS, Realtime, functions, Vault, cron in one free project, no card |
| Auth | Supabase Auth email + password, public signup disabled, `signup` function with invite codes | Zero knowledge split of the password; no SMTP dependency |
| Realtime relay | Supabase Realtime `postgres_changes` on `devices` + Expo Push + 10 s poll fallback | Instant when open, wakes the Admin when closed |
| Blob storage | Google Drive API v3, `drive.file` scope, two accounts | Required by the product; redundancy by dual write |
| Background jobs | pg_cron → pg_net → Edge Functions | Free, no extra service |
| Push | expo-notifications + Expo Push API | Free; FCM credentials only in EAS |
| Hosting | Supabase cloud; Expo Go (dev), EAS Build (APK) | Free tiers |
| Testing | Jest (`jest-expo`) + Testing Library; pgTAP for RLS; Deno test for functions | Standard, CI friendly |
| Tooling | ESLint (expo config) + Prettier + Husky + commitlint (conventional) + GitHub Actions | Enforces Conventional Commits |
| Observability | Structured app logger (no plaintext, no keys), Supabase function logs, `audit_log` table | Enough for four users; audit is a product feature |

## Cross child contracts

These are referenced by every child and must not drift:

1. **Device header**: every PostgREST and Edge Function request from an approved device carries `x-f2h-device: <base64 device token>`. The server stores only `sha256(token)` as hex. `is_approved_device()` (child data-model-rls) is the single source of truth.
2. **Ciphertext wire format**: `0x01 || nonce(24) || ciphertext+tag`, base64 in JSON/DB columns, raw bytes in files (child crypto-envelope).
3. **Sealed box**: `0x01 || eph_pub(32) || nonce(24) || ct` with the HKDF and AAD construction in child crypto-envelope.
4. **Key material**: lives only in `key_material` (one row per user), never in `profiles`; readable only by its owner from an approved device with an active profile.
5. **Ids**: all ids are UUID v4 generated on the client with `expo-crypto`; blob ids are 16 random bytes.
6. **Statuses**: `profiles.status ∈ {pending, active, suspended}`; `devices.status ∈ {pending, approved, rejected, revoked, expired}`; `file_blobs.state ∈ {uploading, ok, degraded, missing}`.
7. **Backup shape**: `{schema: 1, taken_at, tables: {...}}` sealed to `recovery_pub`, named `f2h-backup-<iso date>.bin`, 30 day retention on each Drive.
8. **Audit**: `audit_log(actor_id, actor_device_id, action, target_user_id, target_item_id, meta, created_at)`, insert only.
9. **Folder rules**: `src/app/` holds routes only; only `src/crypto/` handles key bytes; features own their `api.ts`, `hooks.ts`, `model.ts`; nothing logs plaintext or keys.
10. **Deep links**: scheme `f2h://` in builds; Expo Go uses `Linking.createURL()` at runtime.

## Build plan

Umbrella only (child specs carry the atomic tasks):

1. Scaffold the project and tooling (feature 1 Stack & architecture): repo, ignore rules, Expo scaffold trimmed to the planned tree, path alias, strict TypeScript, Jest, CI, icon, README, first push without `doc/`, satisfies **AC-1**, **AC-2**.
2. Run the Drive resumable upload spike and record the result in `rationale.md` before any Drive code, satisfies **AC-5** precondition.
3. Build the children in order: crypto-envelope → data-model-rls → account-and-device-gate → design-system-motion (can run alongside) → drive-redundancy, satisfies **AC-3**, **AC-4**, **AC-5**.

## Consequences

**Positive**:
- One free backend, no card, no servers to run; the cloud holds only ciphertext and wrapped keys.
- The device gate is enforced by the database and by the key release, not only by UI.
- Pure JS crypto runs in Expo Go today and can be swapped for native later without changing callers.

**Negative / tradeoffs**:
- Pure JS scrypt and XChaCha20 are slower than native: about 1 s per KDF and roughly 10 to 30 MB/s file encryption on a mid range phone. Large videos will feel slow until a dev build with native crypto.
- Supabase free tier pauses after inactivity and offers no backups; the GitHub Actions keep alive and the daily Drive snapshot are mandatory, not optional.
- Remote push does not work in Expo Go on Android; the relay is tested via Realtime in development and push on an EAS build.
- A 1 hour `drive.file` access token reaches an approved device for downloads; a family member could list or trash blobs (all ciphertext, two copies, 30 day trash). `DOWNLOAD_MODE=proxy` exists as a switch.

**Neutral**:
- `doc/` stays untracked; `docs/` (scope, specs) is committed.
- The Admin must keep a paper recovery kit; losing it and the Admin password loses oversight and Admin recovery (member vaults still open with their own passwords).

## Follow-up

- [ ] Phase 0 spike: confirm Drive resumable session PUTs work without an Authorization header (medium confidence); fall back to proxy uploads if not.
- [ ] Verify current Supabase free tier limits and pausing rules at Phase 3.
- [ ] Decide native crypto swap once file sizes exceed what pure JS handles comfortably.

## Rationale

See [rationale.md](rationale.md) for context, options considered, the threat model, the external critique trail and the reference frame analysis.
