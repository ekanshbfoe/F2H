# F2H

A private, zero trust family vault for four people: contacts (Call Directory and WhatsApp), credentials and files, encrypted on the phone and backed up to two Google Drives. New devices wait for the Admin to approve them; daily access is a local PIN.

- App: Expo SDK 57 (React Native, TypeScript, Expo Router), developed in Expo Go.
- Backend: Supabase (Postgres with row level security, Auth, Realtime, Edge Functions).
- Storage: Google Drive, two accounts, encrypted blobs only.

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
```

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

Local stack (needs Docker): `npx supabase start`, `npx supabase db reset`, `npm run db:test` for the pgTAP isolation tests.
