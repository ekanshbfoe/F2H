-- 0013: Drive redundancy (child spec 0001-drive-redundancy). The Google refresh token of each slot
-- lives only in Supabase Vault; `drive_accounts` keeps the secret's id. These helpers are the only
-- way to write or read it, and only the service role (the Edge Functions) may call them.

create or replace function public.drive_link_account(
  p_slot text, p_email text, p_refresh_token text, p_root_folder_id text, p_linked_by uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_secret uuid;
begin
  if p_slot not in ('a', 'b') then
    raise exception 'bad_slot' using errcode = '22023';
  end if;
  select vault_secret_id into v_secret from public.drive_accounts where slot = p_slot for update;
  if v_secret is null then
    v_secret := vault.create_secret(p_refresh_token, 'drive_refresh_' || p_slot, 'Google refresh token, Drive slot ' || p_slot);
  else
    perform vault.update_secret(v_secret, p_refresh_token);
  end if;
  insert into public.drive_accounts (slot, google_email, vault_secret_id, root_folder_id, linked_by, linked_at, status)
  values (p_slot, p_email, v_secret, p_root_folder_id, p_linked_by, now(), 'active')
  on conflict (slot) do update
    set google_email = excluded.google_email,
        vault_secret_id = excluded.vault_secret_id,
        root_folder_id = excluded.root_folder_id,
        linked_by = excluded.linked_by,
        linked_at = now(),
        status = 'active';
  insert into public.audit_log (actor_id, action, meta)
  values (p_linked_by, 'drive.link', jsonb_build_object('slot', p_slot, 'email', p_email));
end;
$$;
revoke execute on function public.drive_link_account(text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.drive_refresh_token(p_slot text)
returns text
language sql stable security definer set search_path = public as $$
  select s.decrypted_secret
  from public.drive_accounts d join vault.decrypted_secrets s on s.id = d.vault_secret_id
  where d.slot = p_slot;
$$;
revoke execute on function public.drive_refresh_token(text) from public, anon, authenticated;

-- A slot whose refresh token Google refused: the Admin must link it again (AC-2).
create or replace function public.drive_mark_relink(p_slot text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_changed boolean;
begin
  update public.drive_accounts set status = 'needs_relink' where slot = p_slot and status = 'active'
  returning true into v_changed;
  if coalesce(v_changed, false) then
    insert into public.audit_log (action, meta) values ('drive.needs_relink', jsonb_build_object('slot', p_slot));
  end if;
  return coalesce(v_changed, false);
end;
$$;
revoke execute on function public.drive_mark_relink(text) from public, anon, authenticated;
