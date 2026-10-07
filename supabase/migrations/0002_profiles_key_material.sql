-- 0002: profiles and key_material. (AC-2)

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null unique,
  display_name text not null default '',
  role public.member_role not null default 'member',
  status public.profile_status not null default 'pending',
  kdf_params jsonb not null,
  member_pubkey bytea null check (member_pubkey is null or octet_length(member_pubkey) = 32),
  activated_at timestamptz null,
  created_at timestamptz not null default now()
);
-- Exactly one Admin.
create unique index profiles_single_admin on public.profiles (role) where role = 'admin';

-- Wrapped Master Keys. Inserted by the signup function or the bootstrap script only.
create table public.key_material (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  mk_wrapped_pw text not null,
  mk_wrapped_admin text not null,
  mk_verifier text not null,
  updated_by_device uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
