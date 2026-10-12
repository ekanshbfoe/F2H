# Runbook: restore F2H from a backup

For the day Supabase, the project, or one Google account is gone. You need:

- the **paper recovery kit** (24 words and the fingerprint),
- **one** of the two Google accounts (Drive A or Drive B) that still has the `F2H Vault` folder,
- a computer with this repository, Node 24 and `npx supabase` working.

Every step below is a recommendation in order. Read the whole page once before you start.

## 1. Get the newest snapshot

1. Open Google Drive for the surviving account → `F2H Vault` → `backups`.
2. Download the newest `f2h-backup-YYYY-MM-DD.bin`. It is sealed; Google and anyone else see noise.
3. Keep the `F2H Vault` folder itself untouched: the encrypted files (`<hex>.bin`) are what the restored vault points at.

## 2. Open it with the kit

```bash
npm run restore:backup -- ~/Downloads/f2h-backup-YYYY-MM-DD.bin --out restore.sql
```

Type the 24 words when asked. The script:

- rebuilds the recovery key from the words, exactly as the phone does,
- refuses the file if the kit's fingerprint differs from the one recorded inside the snapshot,
- writes `restore.sql` and prints how many rows each table has.

`restore.sql` holds wrapped keys and ciphertext only, never a plaintext secret, but treat it like the kit: delete it when the restore is done.

## 3. A fresh Supabase project

1. Create a new free project. Note its ref (the first part of the URL).
2. In `supabase/.env` set `SUPABASE_DB_PASSWORD` and `SUPABASE_SERVICE_ROLE_KEY` for the new project, then:
   ```bash
   npx supabase link --project-ref <new ref>
   npm run db:push
   ```
3. Load the snapshot. It runs in one transaction with triggers off (no webhook pushes, no audit rows written twice):
   ```bash
   set -a; . ./supabase/.env; set +a
   npx supabase db query --linked -f restore.sql
   ```
4. Store the two Vault values the cron jobs read (dashboard SQL editor):
   ```sql
   select vault.create_secret('https://<new ref>.supabase.co', 'project_url');
   select vault.create_secret('<new service role key>', 'service_role_key');
   ```
5. Dashboard → Authentication: turn off "Allow new users to sign up" and email confirmations.
6. Deploy the functions and their secrets:
   ```bash
   npx supabase functions deploy
   npx supabase functions deploy drive-link-callback --no-verify-jwt
   npx supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… DRIVE_STATE_SECRET=<new random value>
   ```
7. In Google Cloud, add the new redirect URI `https://<new ref>.supabase.co/functions/v1/drive-link-callback` to the OAuth client.
8. Point the app at the new project: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env`, then restart Expo.

## 4. Bring the family back

What the snapshot restores: every account (same passwords), every profile and invite, every wrapped key, every vault item including soft deleted ones, file blob records, the audit log and the backup history.

What it deliberately does not restore:

- **Phones.** Every old phone row comes back `revoked` with a placeholder token. Each person logs in again and their phone waits for approval.
- **Drive links.** Refresh tokens were never in the snapshot. Link both Drives again.

In this order:

1. **The Admin first.** Log in with the Admin password on any phone. It waits for approval and no other admin phone exists, so use the kit: "Use my recovery kit" on the waiting screen, type the 24 words. The phone is approved, then Set PIN.
2. Home → Admin → **Google Drives** → link Drive A and Drive B again with the same Google accounts. The existing encrypted files stay where they are; the restored file records still point at them.
3. Each member logs in with their usual password; the Admin approves each phone from Approvals.
4. Home → Admin → **Backups** → Back up now, to start a fresh chain on the new project.
5. Open a few contacts, credentials and one file on each phone to confirm.

## 5. If the kit is gone too

Without the paper kit no snapshot can be opened and no member key can be recovered by the Admin. Each member can still log in on a phone that holds their PIN wrap only while the original project exists. Start a fresh bootstrap (`npm run bootstrap:admin`) and re-enter the data. Keep the kit safe.

## Break glass: approve a phone by SQL (no admin phone, kit at hand but app broken)

Used once on 2026-10-08 when the only admin phone had wiped itself before self approval existed. With the service role, in the dashboard SQL editor, approve the waiting device row directly (this writes the same audit row the app would):

```sql
-- find the waiting row
select id, model, requested_at from public.devices
where user_id = (select admin_user_id from public.family_config where id = 1) and status = 'pending';

-- approve it as the Admin, from the Admin's own previous approved device id (or the same row)
select * from public.decide_device('<pending device id>', 'approve',
  (select admin_user_id from public.family_config where id = 1), '<pending device id>');
```

Prefer the recovery kit path in the app; this is only for when the app itself cannot run.
