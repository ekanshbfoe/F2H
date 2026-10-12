# F2H

A private, zero trust family vault for four people: contacts (Call Directory and WhatsApp), credentials and files, encrypted on the phone and backed up to two Google Drives. New devices wait for the Admin to approve them; daily access is a local PIN.

- App: Expo SDK 57 (React Native, TypeScript, Expo Router), developed in Expo Go, shipped as an EAS build.
- Backend: Supabase (Postgres with row level security, Auth, Realtime, Edge Functions, Vault, pg_cron).
- Storage: Google Drive, two accounts, encrypted blobs and a nightly encrypted snapshot.

Version 0.1.0. What is built, and what still waits for a phone check, is in `docs/scope/scope.md`; every manual step left is in `final_testing_checklist.md`.

## Run

```bash
npm install
cp .env.example .env   # fill in the Supabase URL and anon key
npx expo start         # scan the QR with Expo Go
```

## Checks

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

The database tests in `supabase/tests/database/` run against the linked project without Docker: enable pgTAP, run each file with `npx supabase db query --linked -f <file>`, then drop pgTAP (the files roll back, nothing stays). Files that create an admin profile need the real Admin's id swapped in on the hosted project (one admin rule).

## Secrets, and where each one lives

| Value | Where | Never in |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_EAS_PROJECT_ID` | `.env` (git ignored) and the EAS `preview` and `production` environments | nothing secret; row level security guards the anon key |
| `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` | `supabase/.env` (git ignored) | the app, EAS, git |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DRIVE_STATE_SECRET` | Supabase function secrets (`npx supabase secrets set`) | the app, EAS, git |
| Google refresh tokens | Supabase Vault, written by `drive-link-callback` | anywhere else |
| `project_url`, `service_role_key` | Supabase Vault (read by the cron jobs and the approval webhook) | anywhere else |
| The 24 word recovery kit | paper, at home | any device or file |

## Expo Go limits

- Remote push does not reach Expo Go on Android (SDK 53 and later). The app registers without a push token there; approvals still arrive live over Realtime while both apps are open. Push works in an EAS build.
- `expo-secure-store` cannot require biometrics in Expo Go, so biometric unlock waits for a build.
- Copied secrets cannot be flagged as sensitive to Android's clipboard preview in Expo Go; they are still cleared after 30 seconds and on lock.
- Large files encrypt in pure JavaScript, about 1 MiB at a time; very large videos are slow on a low end phone.

## Where things are

- `docs/scope/scope.md`: what to build, in order.
- `docs/specs/`: the architecture and per area build specs.
- `AGENTS.md`: conventions and rules for humans and agents.
- `src/app/`: routes only. `src/features/`, `src/components/`, `src/crypto/`, `src/services/`: the app.
- `supabase/`: migrations, Edge Functions, tests.

`doc/` (singular) is local reference material and is not tracked.

## Backend setup (once per Supabase project)

1. `npx supabase login`, then `npx supabase link --project-ref <ref>` (the ref is the first part of your project URL).
2. Put `SUPABASE_DB_PASSWORD` and `SUPABASE_SERVICE_ROLE_KEY` in `supabase/.env` (git ignored, see `supabase/.env.example`).
3. `npm run db:push` applies `supabase/migrations/`, then `npm run db:types` regenerates `src/types/database.types.ts`.
4. In the dashboard SQL editor, store the two values the cron jobs read:
   `select vault.create_secret('https://<ref>.supabase.co', 'project_url');`
   `select vault.create_secret('<service role key>', 'service_role_key');`
5. Dashboard → Authentication: turn off "Allow new users to sign up" and email confirmations (the repo config does this for local runs only).
6. `npm run bootstrap:admin -- <admin email> --password '<admin password>'` seeds the Admin once; rerunning is safe.
7. `npx supabase functions deploy` publishes the Edge Functions in `supabase/functions/` (rerun after changing them). They read the project URL and keys from the runtime. The cron jobs and the approval webhook still need the two Vault secrets from step 4.
8. GitHub → Settings → Secrets: add `SUPABASE_URL` and `SUPABASE_ANON_KEY` for the keep alive workflow.

9. Function secrets for Google Drive: `npx supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… DRIVE_STATE_SECRET=<random>`, then deploy the OAuth callback without JWT checks: `npx supabase functions deploy drive-link-callback --no-verify-jwt`.

Local stack (needs Docker): `npx supabase start`, `npx supabase db reset`, `npm run db:test` for the pgTAP tests.

## Google Cloud setup (once)

1. A Google Cloud project with the **Google Drive API** enabled.
2. An OAuth client of type **Web application** with the redirect URI `https://<project ref>.supabase.co/functions/v1/drive-link-callback`.
3. The OAuth consent screen asking only for `https://www.googleapis.com/auth/drive.file`, **published to Production** (in Testing, Google drops the link after 7 days; `drive.file` needs no verification).
4. In the app: Home → Admin → Google Drives → link Drive A (the Admin's account) and Drive B (the Father's account, signed in on the Admin's phone with him present).

## Build an installable app (EAS)

The project is configured; nothing here needs code changes.

```bash
npx eas-cli login                 # once, with the Expo account that owns project f2h
npm run eas:env                   # copies the three EXPO_PUBLIC values from .env into EAS preview and production
npx eas-cli build --profile preview --platform android
```

- `preview` builds an **APK** for internal distribution: EAS prints a link and a QR code; open it on each family phone to install.
- `production` builds an app bundle for the Play Store (`npx eas-cli build --profile production --platform android`); the version code is kept by EAS (`appVersionSource: remote`).
- **Push on Android** needs Firebase Cloud Messaging credentials once: create a Firebase project for the package `com.ekansh.f2h`, then `npx eas-cli credentials` → Android → Push Notifications → upload the FCM V1 service account key. Without it the build works, it just receives no push.
- After installing a build, the phone is a new device: log in, wait for approval (or use the recovery kit on the Admin phone), set a PIN.

## Recovery

- Lost the only Admin phone: log in on any phone, "Use my recovery kit", type the 24 words.
- Lost Supabase or a Google account: `docs/runbooks/restore.md` (snapshot on either Drive + the paper kit).
