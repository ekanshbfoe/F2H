# Set up your own F2H

This guide takes you from a fresh clone to your family's own vault on your phones. It takes
about 45 minutes the first time. Every service here has a free plan that is enough for a family.

Your copy runs on **your** accounts: your Supabase database, your Google Drive, your Expo
builds. Nothing connects to anyone else's F2H.

## What you need

- A computer with [Node.js 24](https://nodejs.org) or newer and [Git](https://git-scm.com).
- An Android phone with [Expo Go](https://expo.dev/go) installed, for testing.
- Free accounts on [Supabase](https://supabase.com), [Google Cloud](https://console.cloud.google.com)
  and [Expo](https://expo.dev).

## 1. Get the code

```bash
git clone https://github.com/ekanshbfoe/F2H.git
cd F2H
npm install
cp .env.example .env
cp supabase/.env.example supabase/.env
```

You fill in those two `.env` files in the next steps. Git ignores both; never commit them.

## 2. Create the Supabase project

1. Supabase dashboard, **New project**. Choose a strong database password and keep it.
2. When it is ready, open **Project Settings, API** and copy:
   - the **Project URL** into `EXPO_PUBLIC_SUPABASE_URL` in `.env`
   - the **anon public** key into `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env`
   - the **service_role** key into `SUPABASE_SERVICE_ROLE_KEY` in `supabase/.env`
3. Put the database password into `SUPABASE_DB_PASSWORD` in `supabase/.env`.
4. **Authentication, Sign In / Providers**: turn **off** "Allow new users to sign up" and
   "Confirm email". Family members join only with an invite code from the Admin.

## 3. Create the Google Drive app

F2H keeps encrypted copies of every file on Google Drive. It only ever sees the files it made.

1. Google Cloud console, create a project, then **APIs & Services, Library**: enable the
   **Google Drive API**.
2. **OAuth consent screen**: type External, add the scope
   `https://www.googleapis.com/auth/drive.file` only, then **Publish app** to Production.
   This scope needs no Google review. In Testing mode Google drops the Drive link after 7 days.
3. **Credentials, Create credentials, OAuth client ID**, type **Web application**. Add this
   **Authorized redirect URI**, with your project ref from the Supabase URL:

   ```
   https://<your-project-ref>.supabase.co/functions/v1/drive-link-callback
   ```

4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in
   `supabase/.env`.

## 4. Set up the backend

```bash
npx supabase login
npm run setup:backend
```

This links your project, creates the tables and security rules, stores what the nightly jobs
need, sets the Google secrets and deploys the server functions. It is safe to run again.

## 5. Create the Admin

The Admin is the person who approves every new phone and invites the family.

```bash
npm run bootstrap:admin -- you@example.com --password "a strong password"
```

## 6. Open the app

```bash
npx expo start --go
```

Scan the QR code with Expo Go (phone and computer on the same Wi-Fi), then:

1. Log in with the Admin email and password. The first Admin phone is approved on the spot.
2. **Write the 24 recovery words on paper.** They are the only way back in if the Admin
   password is lost or the database must be restored. Nobody can recover them for you.
3. Set your PIN.
4. **Family tab, Google Drives**: link Drive A (the Admin's Google account) and, if you want a
   second copy, Drive B (another family member's account).
5. **Family tab, Members and invites**: add each family member with a relation, then hand them their invite code in
   person. They sign up with it, and you approve their phone.

## 7. Build an installable APK

Expo Go is for testing. For everyday use, build a real app:

1. In `.env`, set `F2H_APP_ID` to your own id, for example `com.yourname.f2h`. Pick it once:
   changing it later makes a different app.
2. Run:

   ```bash
   npx eas-cli login
   npx eas-cli init
   ```

   Copy the project id it prints into `EXPO_PUBLIC_EAS_PROJECT_ID` in `.env`.
3. Send your app settings to Expo and build:

   ```bash
   npm run eas:env
   npx eas-cli build --profile preview --platform android
   ```

   About 15 minutes later Expo prints a link. Open it on each phone to install. An installed
   app counts as a new phone: log in and approve it like any other.

The APK contains your Supabase URL and anon key. They are public by design (the database rules
and the Admin approval protect the vault), but share the APK only with your family.

## Optional extras

- **Push notifications on Android**: create a Firebase project for your `F2H_APP_ID`, then
  `npx eas-cli credentials`, Android, Push Notifications, upload the FCM V1 service account key,
  and rebuild. Without it, approval requests still pop up while the Admin has the app open.
- **Keep the free database awake**: Supabase pauses free projects after a week without use.
  In your GitHub fork, **Settings, Secrets and variables, Actions**, add `SUPABASE_URL` and
  `SUPABASE_ANON_KEY`. The `keepalive` workflow then pings the project every 3 days.

## Where your secrets live

| Value | Where | Never in |
|---|---|---|
| Supabase URL, anon key, EAS project id, app id | `.env` and your EAS environments | nothing secret |
| Database password, service role key | `supabase/.env` | the app, EAS, git |
| Google client id and secret | `supabase/.env` and Supabase function secrets | the app, EAS, git |
| Google Drive refresh tokens | Supabase Vault, written when you link a Drive | anywhere else |
| The 24 recovery words | paper, at home | any device or file |

## If something goes wrong

- **"That email and password do not match"** right after setup: run step 5 again, and check the
  email has no capital letters or spaces.
- **`setup:backend` says you are not logged in**: run `npx supabase login`, then rerun it.
- **Linking Google Drive fails**: the redirect URI in step 3 must match your project ref
  exactly, and the consent screen must be published.
- **Expo Go keeps loading**: move closer to the router, close Expo Go fully and scan again, or
  run `npx expo start --go -c`.
- **Lost the only Admin phone**: log in on any phone, choose "Use my recovery kit" and type the
  24 words.
- **Lost the database**: follow `docs/runbooks/restore.md` with a Drive backup and the 24 words.
