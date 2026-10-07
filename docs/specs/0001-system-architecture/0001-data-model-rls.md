# 0001 child: Data model and row level security

Part of [0001 system architecture](index.md). Build spec for feature 5 (Backend foundation).

## Summary

The Supabase database holds only ciphertext, wrapped keys and small metadata. Row level security (rules the database applies to every query) keeps each member inside their own rows and refuses key material to any device the Admin has not approved. Functions run with the service role for the few cross user operations, and each of those writes an audit row. This child also covers the bootstrap script that seeds the Admin and the keep alive that stops the free project from pausing.

## Requirements

**Acceptance criteria**:
- **AC-1**: `supabase start` applies all migrations on a fresh local stack without error; `supabase db reset` is idempotent.
- **AC-2**: All tables, enums, indexes and constraints below exist with the listed columns and defaults.
- **AC-3**: Public signup, email confirmation and password recovery emails are disabled in `supabase/config.toml` and documented for the hosted dashboard.
- **AC-4**: `is_approved_device()` is `SECURITY DEFINER STABLE`, reads the lowercase `x-f2h-device` header, and returns true only for an `approved` device of `auth.uid()` whose `token_hash` matches.
- **AC-5**: pgTAP tests prove: member A cannot select member B's `vault_items`, `file_blobs`, `key_material`, `devices`; a pending device (no header or wrong token) selects 0 rows from `key_material` and `vault_items`; an approved device selects its own rows; the admin cannot select `vault_items` directly; nobody can update or delete `audit_log`.
- **AC-6**: Updating `key_material` writes an `audit_log` row (`action = key_material.update`) via trigger.
- **AC-7**: `devices` is in the `supabase_realtime` publication; the partial unique index `(user_id) where status = 'pending'` exists.
- **AC-8**: `supabase/functions/_shared/` exports typed helpers: service and user scoped Supabase clients, `requireApprovedDevice()`, `requireAdmin()`, `sendPush()`, `geoLookup()`, `jsonError()`.
- **AC-9**: `npm run db:types` regenerates `src/types/database.types.ts`; `src/services/supabase.ts` sets the `x-f2h-device` header when a token exists.
- **AC-10**: `npm run bootstrap:admin -- <email> <authSecret>` creates the Admin auth user, `profiles` (admin, active), `allowed_members` (admin) and `family_config.admin_user_id`, and is safe to rerun (no duplicates).
- **AC-11**: `.github/workflows/keepalive.yml` calls `rpc/health` with the anon key every 3 days and fails loudly if the call fails.

## Decision

Postgres on Supabase with RLS as the isolation boundary; functions with the service role only for cross user operations; pg_cron + pg_net for schedules; Database Webhooks for the approval push.

**Implementation skills**: none.

## Feature design

**Tables** (all with `created_at timestamptz default now()`):

| Table | Columns | Constraints |
|---|---|---|
| `family_config` | `id int pk default 1 check (id = 1)`, `admin_user_id uuid null references auth.users`, `admin_recovery_pubkey bytea null`, `recovery_fingerprint text null`, `updated_at` | singleton |
| `allowed_members` | `email citext pk`, `label member_label not null`, `invite_code_hash text null`, `invite_expires_at timestamptz null`, `consumed_at timestamptz null`, `added_by uuid null` | `label ∈ (admin, father, mother, brother)` |
| `profiles` | `id uuid pk references auth.users on delete cascade`, `email citext unique`, `display_name text`, `role member_role default 'member'`, `status profile_status default 'pending'`, `kdf_params jsonb not null`, `member_pubkey bytea null`, `activated_at timestamptz null` | one admin: unique partial index on `(role) where role = 'admin'` |
| `key_material` | `user_id uuid pk references profiles on delete cascade`, `mk_wrapped_pw text not null`, `mk_wrapped_admin text not null`, `mk_verifier text not null`, `updated_at`, `updated_by_device uuid null` | |
| `devices` | `id uuid pk`, `user_id uuid references profiles`, `token_hash text unique not null`, `registration_nonce text not null`, `name text`, `model text`, `os text`, `app_version text`, `pubkey bytea`, `push_token text null`, `status device_status default 'pending'`, `requested_at`, `decided_at`, `decided_by uuid null`, `last_ip inet null`, `last_geo jsonb null`, `last_seen_at` | unique `(user_id, registration_nonce)`; partial unique `(user_id) where status = 'pending'` |
| `vault_items` | `id uuid pk`, `owner_id uuid references profiles`, `kind item_kind`, `dek_wrapped text not null`, `ciphertext text not null`, `version int default 1`, `updated_at`, `deleted_at timestamptz null` | index `(owner_id, updated_at)` |
| `file_blobs` | `id bytea pk (16 bytes)`, `item_id uuid null references vault_items`, `owner_id uuid`, `size_ct bigint`, `sha256 bytea`, `chunk_size int`, `total_chunks int`, `drive_a_file_id text null`, `drive_b_file_id text null`, `state blob_state default 'uploading'`, `last_verified_at timestamptz null` | |
| `drive_accounts` | `slot char(1) pk check (slot in ('a','b'))`, `google_email text`, `vault_secret_id uuid`, `root_folder_id text`, `linked_by uuid`, `linked_at`, `status drive_status default 'active'`, `bytes_used bigint default 0` | |
| `recovery_grants` | `id uuid pk`, `member_id uuid`, `device_id uuid`, `mk_sealed_for_device text`, `created_by uuid`, `expires_at`, `consumed_at null` | |
| `audit_log` | `id bigserial pk`, `actor_id uuid null`, `actor_device_id uuid null`, `action text`, `target_user_id uuid null`, `target_item_id uuid null`, `meta jsonb default '{}'` | UPDATE/DELETE revoked from all roles |
| `backups` | `id uuid pk`, `taken_at`, `drive_a_file_id`, `drive_b_file_id`, `size bigint`, `sha256 bytea`, `state text` | |

**Enums**: `member_label`, `member_role (admin, member)`, `profile_status (pending, active, suspended)`, `device_status (pending, approved, rejected, revoked, expired)`, `item_kind (contact, credential, file, note)`, `blob_state (uploading, ok, degraded, missing)`, `drive_status (active, needs_relink)`.

**Helper**:
```sql
create or replace function public.is_approved_device() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.devices d
    where d.user_id = auth.uid() and d.status = 'approved'
      and d.token_hash = encode(sha256(decode(
        coalesce(current_setting('request.headers', true)::json->>'x-f2h-device', ''), 'base64')), 'hex')
  );
$$;
create or replace function public.is_active_member() returns boolean ... -- profiles.status = 'active' for auth.uid()
create or replace function public.is_admin() returns boolean ... -- role = 'admin' for auth.uid()
```

**Policies** (summary):
- `family_config`: select for authenticated; write service role only.
- `allowed_members`: select/insert/update for `is_admin() and is_approved_device()`.
- `profiles`: select own; select all for `is_admin()`; update own `display_name` only (column level via trigger).
- `key_material`: select/update own where `is_approved_device() and is_active_member()`; insert service role only.
- `devices`: select own; select all for `is_admin()`; update own `push_token`, `name`, `last_seen_at` only; status changes service role only.
- `vault_items`, `file_blobs`: all operations own where `is_approved_device() and is_active_member()`; no admin policy (oversight goes through the function).
- `drive_accounts`: no client policy; a view `drive_status_view(slot, google_email, status, bytes_used)` readable by `is_admin()`.
- `recovery_grants`: select own unconsumed where `device_id` matches the approved device; insert via RPC.
- `audit_log`: select where `actor_id = auth.uid() or target_user_id = auth.uid()`; select all for `is_admin()`; insert service role or trigger only.
- `backups`: select for `is_admin()`.

**Triggers**: `key_material` after update → `audit_log`; `vault_items` before update → `updated_at = now()`, `version = old.version + 1`, reject when `new.version <> old.version + 1` is not what the client sent (the client sends the expected old version; mismatch raises `P0001 stale_version`).

**Cron (pg_cron) and webhooks**: `expire-requests` hourly; `reconcile-blobs` 02:00 daily; `backup-metadata` 03:00 daily; all via `pg_net` with `timeout_milliseconds = 60000` and the service key header read from Vault. Database Webhook: `devices` INSERT → `notify-admin`.

**RPCs**: `health()` (returns `ok`, anon), `create_invite`, `admin_key_material_for_approval`, `create_recovery_grant` (all `security definer`, check `is_admin() and is_approved_device()`, write audit).

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| RLS check | device token | `x-f2h-device` request header set in `src/services/supabase.ts` from SecureStore |
| audit trigger | actor_device_id | `devices.id` resolved from the same header inside the trigger |
| version guard | expected version | client sends `version` of the row it edited |

**Configuration required**:
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the app.
- `SUPABASE_SERVICE_ROLE_KEY` only in the bootstrap script environment and function secrets.

**Critical test scenarios**: AC-5 isolation matrix in pgTAP; AC-6 trigger; AC-10 rerun safety.

## Build plan

1. `supabase init`, `config.toml` with auth settings, `seed.sql` for local dev (admin + 3 emails), satisfies **AC-1**, **AC-3**. (done 2026-10-07)
2. Migration 0001: extensions (`citext`, `pgcrypto`, `pg_cron`, `pg_net`, `vault`), enums, `family_config`, `allowed_members`, satisfies **AC-2**. (done 2026-10-07, applied to the hosted project with db:push)
3. Migration 0002: `profiles`, `key_material`, satisfies **AC-2**. (done 2026-10-07, applied to the hosted project with db:push)
4. Migration 0003: `devices` with indexes and realtime publication, satisfies **AC-2**, **AC-7**. (done 2026-10-07, applied to the hosted project with db:push)
5. Migration 0004: `vault_items` with version trigger, satisfies **AC-2**. (done 2026-10-07, applied to the hosted project with db:push)
6. Migration 0005: `file_blobs`, `drive_accounts`, `recovery_grants`, `backups`, satisfies **AC-2**. (done 2026-10-07, applied to the hosted project with db:push)
7. Migration 0006: `audit_log` with revoked update/delete and the `key_material` trigger, satisfies **AC-6**. (done 2026-10-07, applied to the hosted project with db:push)
8. Migration 0007: helpers and all policies, satisfies **AC-4**. (done 2026-10-07, applied to the hosted project with db:push)
9. Migration 0008: cron jobs, webhook, `health` RPC, satisfies **AC-11** precondition. (done 2026-10-07, applied to the hosted project with db:push)
10. pgTAP tests, satisfies **AC-5**. (written 2026-10-07, not yet executed: needs Docker for the local stack; policies spot checked over REST)
11. `functions/_shared/` helpers, satisfies **AC-8**. (done 2026-10-07)
12. `db:types` script and the app client with the device header, satisfies **AC-9**. (done 2026-10-07, types generated from the linked project)
13. `scripts/bootstrap-admin.ts`, satisfies **AC-10**. (done 2026-10-07, run twice against the hosted project)
14. `keepalive.yml`, satisfies **AC-11**. (done 2026-10-07)

## Consequences

**Positive**: isolation and the device gate are enforced in SQL and proven by tests.
**Negative**: Realtime cannot see the device header, so `devices` carries no secrets and is the only realtime table; the free project needs an external keep alive.
**Neutral**: the service role key exists only in function secrets and the bootstrap environment.
