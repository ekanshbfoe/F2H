# Security policy

F2H holds a family's passwords and private files, so security reports are welcome and taken
seriously.

## Report a problem privately

Please do not open a public issue for a security problem. Use GitHub's private reporting
instead: the repository's **Security** tab, then **Report a vulnerability**. Include what you
found, how to reproduce it, and what an attacker could gain.

You should hear back within 7 days. Once a fix is out, you are credited in the release notes
unless you prefer not to be.

## Supported versions

Only the latest release gets security fixes. Each family runs its own copy, so update yours by
pulling the new release and following the upgrade notes in `CHANGELOG.md`.

## In scope

- Anything that reveals vault contents, keys or the recovery kit to the server, Google Drive or
  another family member.
- Getting past the Admin approval of new phones, the PIN lock or the row level security rules.
- Weaknesses in the encryption, the password split or the backup format.

## Out of scope

- A phone that is rooted or already compromised, or someone watching the screen.
- The public Supabase URL and anon key inside an APK: they are public by design.
- Problems in Supabase, Google or Expo themselves (report those to them).

The threat model is in `docs/specs/0001-system-architecture/rationale.md`.
