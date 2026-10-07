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
