# F2H

A private, zero trust family vault: contacts, passwords and files, encrypted on the phone before
they leave it and backed up to Google Drive. Built for one family on free plans, and made so any
family can run its own copy.

- **Encrypted on the phone.** The server and Google Drive only ever hold ciphertext. The login
  password is split on the phone, so Supabase never sees the half that unlocks the vault.
- **Every new phone needs the Admin's approval.** Knowing a password is not enough. Daily
  access is a local PIN, and the app locks itself when you leave it.
- **Recoverable.** A 24 word paper kit restores the Admin, and a nightly encrypted snapshot on
  Drive restores the database.
- **Runs on a 1 GB, 8 year old Android phone.**

## Set up your own

Follow **[SETUP.md](SETUP.md)**: create free Supabase, Google Cloud and Expo accounts, fill in
two `.env` files, run one setup command, and build your APK. About 45 minutes.

## Stack

- App: Expo SDK 57 (React Native, TypeScript, Expo Router, Reanimated), pure JavaScript crypto
  (`@noble/*`): XChaCha20 Poly1305, X25519 sealed boxes, scrypt and HKDF.
- Backend: Supabase (Postgres with row level security, Auth, Realtime, Edge Functions, Vault,
  pg_cron).
- Storage: Google Drive with the `drive.file` scope, one or two accounts.

## Develop

```bash
npm install
npx expo start --go     # scan the QR with Expo Go
npm run typecheck
npm run lint
npm test
```

The database tests in `supabase/tests/database/` run against a linked project with
`npx supabase db query --linked -f <file>` (enable pgTAP first; every file rolls back), or
locally with Docker: `npx supabase start`, `npx supabase db reset`, `npm run db:test`.

### Expo Go limits

- Remote push does not reach Expo Go on Android. Approvals still arrive live while the Admin
  has the app open. Push works in an EAS build with Firebase set up.
- Biometric unlock and sensitive clipboard flags need an EAS build.
- Large files encrypt about 1 MiB at a time in JavaScript, so big videos are slow on a low end
  phone.

## Where things are

- `src/app/`: routes only. `src/features/`, `src/components/`, `src/crypto/`, `src/services/`:
  the app.
- `supabase/`: migrations, Edge Functions and tests.
- `scripts/`: backend setup, Admin bootstrap, backup restore, EAS settings.
- `docs/specs/`: the architecture and the design of each area. `docs/scope/scope.md`: what was
  built, in order. `docs/runbooks/restore.md`: disaster recovery.
- `AGENTS.md`: conventions and rules for people and coding agents.

## Security

Found a security problem? Please read [SECURITY.md](SECURITY.md) and report it privately.

## License

[MIT](LICENSE)
