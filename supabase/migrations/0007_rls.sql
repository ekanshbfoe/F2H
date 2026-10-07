-- 0007: helpers and row level security. (AC-4, AC-5)
-- Helpers are SECURITY DEFINER so a policy on devices never recurses into devices.

create or replace function public.is_approved_device() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.devices d
    where d.user_id = auth.uid() and d.status = 'approved'
      and d.token_hash = encode(sha256(decode(
        coalesce(current_setting('request.headers', true)::json->>'x-f2h-device', ''), 'base64')), 'hex')
  );
$$;

create or replace function public.is_active_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active'
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

revoke execute on function public.is_approved_device(), public.is_active_member(), public.is_admin() from public, anon;
grant execute on function public.is_approved_device(), public.is_active_member(), public.is_admin() to authenticated;

alter table public.family_config enable row level security;
alter table public.allowed_members enable row level security;
alter table public.profiles enable row level security;
alter table public.key_material enable row level security;
alter table public.devices enable row level security;
alter table public.vault_items enable row level security;
alter table public.file_blobs enable row level security;
alter table public.drive_accounts enable row level security;
alter table public.recovery_grants enable row level security;
alter table public.audit_log enable row level security;
alter table public.backups enable row level security;

-- family_config: everyone signed in may read (fingerprint check at signup); writes are service role only.
create policy family_config_select on public.family_config
  for select to authenticated using (true);

-- allowed_members: Admin from an approved device.
create policy allowed_members_admin_select on public.allowed_members
  for select to authenticated using (public.is_admin() and public.is_approved_device());
create policy allowed_members_admin_insert on public.allowed_members
  for insert to authenticated with check (public.is_admin() and public.is_approved_device());
create policy allowed_members_admin_update on public.allowed_members
  for update to authenticated
  using (public.is_admin() and public.is_approved_device())
  with check (public.is_admin() and public.is_approved_device());

-- profiles: own row; the Admin sees all (no secrets live here). Only display_name is client editable.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_admin());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

-- key_material: the owner, from an approved device, with an active profile. Insert is service role only.
create policy key_material_select_own on public.key_material
  for select to authenticated
  using (user_id = auth.uid() and public.is_approved_device() and public.is_active_member());
create policy key_material_update_own on public.key_material
  for update to authenticated
  using (user_id = auth.uid() and public.is_approved_device() and public.is_active_member())
  with check (user_id = auth.uid() and public.is_approved_device() and public.is_active_member());
revoke insert, delete on public.key_material from anon, authenticated;

-- devices: own rows without the device check (a pending device watches its own row over Realtime);
-- the Admin sees all. Clients may change only push_token, name and last_seen_at; status changes are service role only.
create policy devices_select_own on public.devices
  for select to authenticated using (user_id = auth.uid());
create policy devices_select_admin on public.devices
  for select to authenticated using (public.is_admin());
create policy devices_update_own on public.devices
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.devices from authenticated;
grant update (push_token, name, last_seen_at) on public.devices to authenticated;
revoke insert, delete on public.devices from anon, authenticated;

-- vault_items and file_blobs: the owner from an approved device. No Admin policy: oversight goes through a function.
create policy vault_items_own on public.vault_items
  for all to authenticated
  using (owner_id = auth.uid() and public.is_approved_device() and public.is_active_member())
  with check (owner_id = auth.uid() and public.is_approved_device() and public.is_active_member());
create policy file_blobs_select_own on public.file_blobs
  for select to authenticated
  using (owner_id = auth.uid() and public.is_approved_device() and public.is_active_member());
revoke insert, update, delete on public.file_blobs from anon, authenticated;

-- drive_accounts: no client policy at all; the Admin reads a sanitized view.
revoke all on public.drive_accounts from anon, authenticated;
create view public.drive_status_view as
  select slot, google_email, status, bytes_used, linked_at
  from public.drive_accounts
  where public.is_admin();
grant select on public.drive_status_view to authenticated;

-- recovery_grants: a device reads its own unconsumed, unexpired grant. Inserts go through an RPC.
create policy recovery_grants_select_own_device on public.recovery_grants
  for select to authenticated
  using (member_id = auth.uid() and device_id = public.current_device_id()
         and consumed_at is null and expires_at > now());
revoke insert, update, delete on public.recovery_grants from anon, authenticated;

-- audit_log: a member sees rows about them; the Admin sees everything. Inserts come from functions and triggers.
create policy audit_log_select_involved on public.audit_log
  for select to authenticated using (actor_id = auth.uid() or target_user_id = auth.uid());
create policy audit_log_select_admin on public.audit_log
  for select to authenticated using (public.is_admin());
revoke insert on public.audit_log from anon, authenticated;

-- backups: Admin read only.
create policy backups_select_admin on public.backups
  for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.backups from anon, authenticated;

-- allowed_members and family_config are never client writable beyond the policies above.
revoke delete on public.allowed_members from anon, authenticated;
revoke insert, update, delete on public.family_config from anon, authenticated;
