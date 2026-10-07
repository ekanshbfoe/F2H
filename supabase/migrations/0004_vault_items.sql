-- 0004: vault_items with the version guard. (AC-2)

create table public.vault_items (
  id uuid primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  kind public.item_kind not null,
  dek_wrapped text not null,
  ciphertext text not null,
  version int not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);
create index vault_items_owner_updated on public.vault_items (owner_id, updated_at);

-- The client sends the version of the row it edited. A stale version is refused
-- (P0001 stale_version); on success the row moves to version + 1.
create or replace function public.vault_items_before_update() returns trigger
language plpgsql as $$
begin
  if new.version <> old.version then
    raise exception 'stale_version' using errcode = 'P0001',
      detail = format('expected version %s, got %s', old.version, new.version);
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger vault_items_version_guard
  before update on public.vault_items
  for each row execute function public.vault_items_before_update();
