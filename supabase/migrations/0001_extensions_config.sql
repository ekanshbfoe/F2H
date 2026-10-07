-- 0001: extensions, enums, family_config singleton, allowed_members.
-- Spec: docs/specs/0001-system-architecture/0001-data-model-rls.md (AC-2)

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

create type public.member_label as enum ('admin', 'father', 'mother', 'brother');
create type public.member_role as enum ('admin', 'member');
create type public.profile_status as enum ('pending', 'active', 'suspended');
create type public.device_status as enum ('pending', 'approved', 'rejected', 'revoked', 'expired');
create type public.item_kind as enum ('contact', 'credential', 'file', 'note');
create type public.blob_state as enum ('uploading', 'ok', 'degraded', 'missing');
create type public.drive_status as enum ('active', 'needs_relink');

-- One row, id = 1. Holds the Admin's id and recovery public key once bootstrapped.
create table public.family_config (
  id int primary key default 1 check (id = 1),
  admin_user_id uuid null references auth.users (id) on delete set null,
  admin_recovery_pubkey bytea null check (admin_recovery_pubkey is null or octet_length(admin_recovery_pubkey) = 32),
  recovery_fingerprint text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.family_config (id) values (1);

-- Who may sign up. The invite code is handed over in person; only its hash is stored.
create table public.allowed_members (
  email citext primary key,
  label public.member_label not null,
  invite_code_hash text null,
  invite_expires_at timestamptz null,
  consumed_at timestamptz null,
  added_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index allowed_members_one_per_label on public.allowed_members (label);
