# F2H: agent context

F2H is a zero trust family vault (Expo app + Supabase backend + two Google Drives) for four people. Read `docs/scope/scope.md` for what to build next and `docs/specs/0001-system-architecture/index.md` for the contracts every feature shares. `doc/` (singular) holds untracked reference material and must never be committed.

## Stack

- Expo SDK 57, React Native 0.86, React 19, TypeScript 6 strict, Expo Router (routes in `src/app/`), Hermes.
- Reanimated 4, Gesture Handler, react-native-svg for motion; `StyleSheet` + tokens for styling (no CSS in JS runtime).
- Zustand + TanStack Query for state; react-hook-form + zod for forms.
- Crypto: `@noble/hashes`, `@noble/ciphers`, `@noble/curves`, `@scure/bip39`, `expo-crypto` (pure JS, Expo Go compatible).
- Supabase (Postgres + RLS, Auth, Realtime, Edge Functions in Deno, Vault, pg_cron) as the only backend. Google Drive v3 via Edge Functions only.
- Tests: Jest (`jest-expo`) + Testing Library; pgTAP for RLS; Deno test for functions.

**Build approach:** Tracer Bullet. **Workflow:** Beta (GA on crypto, auth/device gate, Drive, backups).

## Expo has changed, do not trust training data

Expo ships breaking changes every SDK. Before touching an Expo, EAS or React Native API, read the `expo` major in `package.json` and fetch `https://docs.expo.dev/versions/v57.0.0/` (or `https://docs.expo.dev/llms.txt`). Never answer from memory.

## Commands

```bash
npx expo install <package>   # always, never npm add, so versions match the SDK
npx expo start               # dev server (Expo Go)
npm run typecheck            # tsc --noEmit
npm run lint                 # expo lint
npm test                     # jest
npx expo-doctor              # dependency and config health
```

Run typecheck, lint and tests before declaring any task done. Commit with Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`, `ci:`, `perf:`), one logical unit per commit; commitlint enforces it.

## Folder rules

- `src/app/` holds routes only (thin wrappers). Components, hooks, services and features live outside it.
- `src/crypto/` is the only place that touches key bytes. Everything else calls its `index.ts`.
- Each feature folder in `src/features/<name>/` owns `api.ts`, `hooks.ts`, `model.ts` and optional `screens/`.
- `src/services/supabase.ts` is the only Supabase client; it adds the `x-f2h-device` header when a device token exists.
- `supabase/migrations/` are append only; never edit an applied migration.
- `supabase/functions/_shared/` holds the helpers every function uses.

## Security rules

- Never log plaintext vault data, keys, tokens, passwords or the device token. The logger redacts by design.
- Never put a Google secret, refresh token or service role key in the app or in `.env.example`. Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are client side.
- Every AEAD call has an AAD; nonces are random; a DEK is never reused across blobs.
- Every cross user operation goes through an Edge Function and writes `audit_log`.
- Key material lives only in `key_material`, readable only by its owner from an approved device.

## Expo Go limits (development runs in Expo Go)

- Only Expo Go bundled native modules; pure JS libraries otherwise. Check before adding a dependency.
- Remote push does not work in Expo Go on Android (SDK 53+); `getExpoPushTokenAsync` throws there, wrap it.
- `expo-secure-store` `requireAuthentication` is not available in Expo Go; use the biometric fallback.
- `ios/` and `android/` are generated (CNG); configure native behavior in `app.json` and config plugins only.

## Agent skills

The JSMastery workflow suite is installed locally under `.claude/skills/` (untracked): `architect`, `scope`, `develop`, `check`, `test`, `debug`, `document`, `audit`, `sync`. No community (stack specific) skills are installed yet.
