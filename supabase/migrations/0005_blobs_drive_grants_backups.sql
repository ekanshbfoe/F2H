-- 0005: file_blobs, drive_accounts, recovery_grants, backups. (AC-2)

create table public.file_blobs (
  id bytea primary key check (octet_length(id) = 16),
  item_id uuid null references public.vault_items (id) on delete set null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  size_ct bigint not null check (size_ct >= 0),
  sha256 bytea not null check (octet_length(sha256) = 32),
  chunk_size int not null check (chunk_size > 0),
  total_chunks int not null check (total_chunks > 0),
  drive_a_file_id text null,
  drive_b_file_id text null,
  state public.blob_state not null default 'uploading',
  last_verified_at timestamptz null,
  created_at timestamptz not null default now(),
  -- an ok blob has both copies
  check (state <> 'ok' or (drive_a_file_id is not null and drive_b_file_id is not null))
);
create index file_blobs_owner on public.file_blobs (owner_id);
create index file_blobs_state on public.file_blobs (state);

-- Service role only. The refresh token lives in Vault; only its secret id is here.
create table public.drive_accounts (
  slot char(1) primary key check (slot in ('a', 'b')),
  google_email text not null,
  vault_secret_id uuid not null,
  root_folder_id text not null,
  linked_by uuid null references auth.users (id) on delete set null,
  linked_at timestamptz not null default now(),
  status public.drive_status not null default 'active',
  bytes_used bigint not null default 0,
  created_at timestamptz not null default now()
);

-- Admin assisted password reset: the member MK sealed to one device's public key.
create table public.recovery_grants (
  id uuid primary key,
  member_id uuid not null references public.profiles (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  mk_sealed_for_device text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);
create index recovery_grants_device on public.recovery_grants (device_id) where consumed_at is null;

create table public.backups (
  id uuid primary key,
  taken_at timestamptz not null default now(),
  drive_a_file_id text null,
  drive_b_file_id text null,
  size bigint not null default 0,
  sha256 bytea null check (sha256 is null or octet_length(sha256) = 32),
  state text not null default 'ok',
  created_at timestamptz not null default now()
);
