# 0001 child: Account and device gate

Part of [0001 system architecture](index.md). Build spec for feature 6 (Auth & device gate). GA tier.

## Summary

Nobody can create an account without an invite code the Admin hands over in person, and no device can read a vault until the Admin approves it from their own phone. The waiting phone sees the decision instantly over a realtime channel; the Admin is woken by a push. Approval also releases the key material, so a password alone never opens a vault. The Admin's first run creates a paper recovery kit, and a forgotten password is fixed by an Admin grant instead of an email.

## Requirements

**User stories**:
- As a member, I want to sign up with an invite code and wait for the Admin, then never log in again on that phone (only my PIN).
- As the Admin, I want a push and a live list of pending devices with model, location and IP, and one tap to approve or reject.
- As a member who forgot the password, I want the Admin to be able to let me set a new one.

**Acceptance criteria**:
- **AC-1**: The Login / Sign up screen renders with the reference toggle motion; invalid email, short password (< 10 chars) and a mismatched confirm are blocked on device.
- **AC-2**: Signup without a valid, unexpired, unused invite code is rejected by the `signup` function with 403; a used code is rejected on second use.
- **AC-3**: A successful signup creates the auth user with `authSecret` as the password, a `profiles` row (`pending`), one `key_material` row and one `pending` device, and returns a device token exactly once.
- **AC-4**: The Admin's first run (profile role admin, no approved admin device) auto approves that device and forces the recovery kit flow: 24 words shown, 3 random words confirmed, `recovery_pub` and fingerprint published in `family_config`, private key stored as an Admin vault item.
- **AC-5**: The Admin can create an invite for an allowlisted email; the code (8 chars, Crockford base32) is shown as text and QR and expires in 7 days.
- **AC-6**: A new device for an existing account registers as `pending` with model, OS, app version, public key, push token (if available) and the server resolved IP and city; a second pending request for the same user is refused (409) and the client reuses the first.
- **AC-7**: The Waiting screen shows the request details, updates within 2 s of the Admin's decision over Realtime, and still updates within 10 s if the websocket is down (poll).
- **AC-8**: A `devices` insert triggers a push to every approved Admin device with member name, model and city; tapping it opens the Approvals screen.
- **AC-9**: The Approvals screen lists pending devices live and shows the approval sheet with the reference morph and radial reveal motion.
- **AC-10**: Before enabling Approve, the Admin phone unseals the member's `mk_wrapped_admin` with the recovery private key and checks `mk_verifier`; a failed check shows a tamper warning and disables Approve.
- **AC-11**: `approve-device` sets `devices.status = approved` and `profiles.status = active` in one transaction, writes `audit_log`, pushes the decision to the requester; reject sets `rejected` and pushes.
- **AC-12**: After approval the device reads `mk_wrapped_pw`, unwraps with the in memory KEK, checks the verifier, and proceeds to Set PIN; before approval the same select returns 0 rows.
- **AC-13**: Rejected and expired states wipe local key material and the device token, show the matching screen and return to login.
- **AC-14**: Pending devices older than 24 h become `expired` by cron; expired invite codes are voided.
- **AC-15**: Forgot password: the Admin creates a recovery grant for a specific device; that device unseals the MK, asks for a new password, and `reset-password` updates the auth password and `mk_wrapped_pw` and consumes the grant (single use, 24 h expiry).
- **AC-16**: Change password (logged in, unlocked) derives the new split, calls `auth.updateUser`, rewrites `mk_wrapped_pw`, and writes an audit row; `mk_wrapped_admin` is unchanged.

## Decision

Supabase Auth with public signup disabled; the `signup`, `register-device`, `approve-device`, `notify-admin`, `expire-requests` and `reset-password` Edge Functions; Realtime on the `devices` table; Expo Push; one time invite codes; out of band Admin bootstrap script.

**Implementation skills**: none.

## Feature design

**State machines**:
- profile: `pending → active → suspended` (suspend is admin only, deferred UI).
- device: `pending → approved | rejected | expired`; `approved → revoked`.
- invite: `issued → consumed | expired`.
- recovery grant: `issued → consumed | expired`.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `functions/v1/signup` | POST | email, authSecret, invite_code, display_name, mk_wrapped_pw, mk_wrapped_admin, mk_verifier, device{model, os, app_version, pubkey, push_token, nonce} | user_id, device_id, device_token | anon key | 403 bad code, 409 email exists |
| `functions/v1/register-device` | POST | device{...}, nonce | device_id, device_token, status | user JWT | 409 pending exists (returns existing id), 401 |
| `functions/v1/approve-device` | POST | device_id, decision (approve/reject) | status | admin JWT + device header | 403 not admin, 404, 409 not pending |
| `functions/v1/notify-admin` | POST (webhook) | record (devices row) | ok | webhook secret header | 401 |
| `functions/v1/reset-password` | POST | grant_id, new_auth_secret, new_mk_wrapped_pw | ok | user JWT + device header | 403 grant invalid |
| `rpc/admin_key_material_for_approval` | POST | user_id | mk_wrapped_admin, mk_verifier | admin JWT + device header | 403 |
| `rpc/create_invite` | POST | email, label | code (plaintext once), expires_at | admin JWT + device header | 403, 409 |
| `rpc/create_recovery_grant` | POST | member_id, device_id, mk_sealed_for_device | grant_id | admin JWT + device header | 403 |
| Realtime `devices` | subscribe | `id=eq.<device_id>` (member), `status=eq.pending` (admin) | row changes | JWT | reconnect |

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| register | IP | `x-forwarded-for` first hop in the function |
| register | city, country | `functions/_shared/geo.ts` (ipwho.is, HTTPS, no key; empty on failure) |
| register | model, os | `expo-device` (`modelName`, `osName + osVersion`) |
| register | push token | `expo-notifications` with EAS `projectId` from `app.json`; null in Expo Go on Android |
| invite | code | 5 random bytes → Crockford base32, stored as sha256 |
| approval check | recovery_priv | Admin vault item `kind = note, tag = recovery-key` decrypted after PIN unlock |
| waiting screen | time since request | `devices.requested_at` vs device clock |
| push body | member name | `profiles.display_name` |

**Key invariants**: at most one pending device per user; a device token is returned once and only its hash is stored; `profiles.status` becomes active only via `approve-device`; a grant is bound to one device and one use.

**Security model**: anon can call only `signup`; members can call `register-device` and `reset-password`; the admin RPCs check `profiles.role = admin` and `is_approved_device()`; the webhook checks a shared secret header; all functions log action rows to `audit_log` via the service role.

**Configuration required**:
- `ADMIN_WEBHOOK_SECRET`: shared secret for `notify-admin`.
- `EXPO_ACCESS_TOKEN` (optional): Expo push API auth.
- `GEO_PROVIDER_URL`: default `https://ipwho.is/`.
- `EXPO_PUBLIC_EAS_PROJECT_ID`: push token registration.

**Critical test scenarios**:
- Happy path: invite → signup → waiting → approve → unwrap → set PIN (AC-2, AC-3, AC-7, AC-11, AC-12).
- Failure: second phone with the password stays pending and reads 0 key rows (AC-6, AC-12).
- Auth: non admin calling `approve-device` gets 403 (AC-11); tampered `mk_wrapped_admin` blocks Approve (AC-10).

## Build plan

1. Login / Sign up screen on the design system toggle and fields, satisfies **AC-1**. (done 2026-10-07)
2. `register-device` function with geo, nonce idempotency and first admin auto approve; client registration storing the token in SecureStore, satisfies **AC-6**, part of **AC-4**. (done 2026-10-07)
3. Admin first run recovery kit (seed, mnemonic, confirm, publish pub + fingerprint, vault item), satisfies **AC-4**. (done 2026-10-07)
4. Members screen with `create_invite` RPC, QR and text, satisfies **AC-5**. (done 2026-10-07)
5. `signup` function and client signup wiring with the password split and key generation, satisfies **AC-2**, **AC-3**. (done 2026-10-07)
6. Push registration with EAS `projectId` and deep link handling, prerequisite for **AC-8**. (done 2026-10-07; push opens the screen named in the payload, no custom scheme needed in Expo Go)
7. Waiting screen with Realtime subscription and poll fallback, satisfies **AC-7**. (done 2026-10-07)
8. `notify-admin` webhook function and Database Webhook wiring, satisfies **AC-8**. (done 2026-10-07)
9. Approvals inbox with live list, satisfies **AC-9** (list part). (done 2026-10-07)
10. Approval check RPC and client verifier check, satisfies **AC-10**. (done 2026-10-07)
11. Approval sheet with morph and radial reveal, `approve-device` function, satisfies **AC-9**, **AC-11**. (done 2026-10-07)
12. Post approval unwrap and handoff to Set PIN, satisfies **AC-12**. (done 2026-10-07; lands on Home until App lock adds Set PIN)
13. Denied and expired screens with wipe; `expire-requests` cron, satisfies **AC-13**, **AC-14**. (done 2026-10-07; expire-requests deployed, cron needs the Vault secrets)
14. Recovery grants RPC, Admin UI, `reset-password` function and the forgot password flow, satisfies **AC-15**. (done 2026-10-07)
15. Change password flow, satisfies **AC-16**. (done 2026-10-07)

## Consequences

**Positive**: the gate is cryptographic and database enforced; no email dependency anywhere.
**Negative**: the Admin must be reachable for every new device and every reset; Expo Go on Android gets no push (Realtime only while the Admin app is open).
**Neutral**: invite codes are the only way in; losing the Admin phone and the paper kit means a fresh bootstrap.
