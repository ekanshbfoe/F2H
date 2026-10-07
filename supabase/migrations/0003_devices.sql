-- 0003: devices, realtime publication, key_material device link. (AC-2, AC-7)

create table public.devices (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  registration_nonce text not null,
  name text not null default '',
  model text not null default '',
  os text not null default '',
  app_version text not null default '',
  pubkey bytea null check (pubkey is null or octet_length(pubkey) = 32),
  push_token text null,
  status public.device_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at timestamptz null,
  decided_by uuid null references auth.users (id) on delete set null,
  last_ip inet null,
  last_geo jsonb null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, registration_nonce)
);
create index devices_user_id on public.devices (user_id);
-- At most one pending request per user: a password holder cannot spam the Admin.
create unique index devices_one_pending_per_user on public.devices (user_id) where status = 'pending';

alter table public.key_material
  add constraint key_material_updated_by_device_fkey
  foreign key (updated_by_device) references public.devices (id) on delete set null;

-- The only realtime table. It carries no secrets; Realtime cannot see the device header.
alter publication supabase_realtime add table public.devices;
