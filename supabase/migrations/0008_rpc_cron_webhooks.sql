-- 0008: health RPC, admin RPCs, cron jobs and the devices webhook. (AC-11 precondition)
--
-- Scheduled jobs call Edge Functions through pg_net. The project URL and the service role key
-- are read from Vault at call time, never stored in SQL. Create them once per project:
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service role key>', 'service_role_key');

-- Keep alive and uptime probe. Anonymous, cheap, no table access.
create or replace function public.health() returns text
language sql stable as $$ select 'ok'::text $$;
grant execute on function public.health() to anon, authenticated;

-- Calls /functions/v1/<name> with the service key. Silent (notice only) until the Vault secrets exist.
create or replace function public.call_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_key text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_url is null or v_key is null then
    raise notice 'call_edge_function(%): vault secrets project_url / service_role_key missing', p_name;
    return null;
  end if;
  select net.http_post(
    url := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := p_body,
    timeout_milliseconds := 60000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke execute on function public.call_edge_function(text, jsonb) from public, anon, authenticated;

-- Database webhook: a new device request wakes the Admin through notify-admin.
create or replace function public.devices_notify_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.call_edge_function('notify-admin', jsonb_build_object(
    'type', 'INSERT', 'table', 'devices', 'schema', 'public',
    'record', jsonb_build_object(
      'id', new.id, 'user_id', new.user_id, 'status', new.status, 'name', new.name,
      'model', new.model, 'os', new.os, 'last_ip', new.last_ip, 'last_geo', new.last_geo,
      'requested_at', new.requested_at)
  ));
  return new;
end;
$$;
create trigger devices_notify_admin after insert on public.devices
  for each row when (new.status = 'pending') execute function public.devices_notify_admin();

-- Cron: expiry sweep hourly, Drive reconcile 02:00, encrypted snapshot 03:00 (UTC).
select cron.schedule('expire-requests', '0 * * * *', $$select public.call_edge_function('expire-requests')$$);
select cron.schedule('reconcile-blobs', '0 2 * * *', $$select public.call_edge_function('reconcile-blobs')$$);
select cron.schedule('backup-metadata', '0 3 * * *', $$select public.call_edge_function('backup-metadata')$$);

-- Admin RPCs. Each checks Admin plus an approved device and writes an audit row.

create or replace function public.assert_admin_device() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() and public.is_approved_device()) then
    raise exception 'admin_device_required' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.assert_admin_device() from public, anon;

-- Creates or refreshes the invite for an allowed email. Returns the plain 8 char code once.
create or replace function public.create_invite(p_email citext, p_label public.member_label)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  v_bytes bytea := extensions.gen_random_bytes(8);
  i int;
begin
  perform public.assert_admin_device();
  if p_label = 'admin' then
    raise exception 'cannot_invite_admin' using errcode = '22023';
  end if;
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  insert into public.allowed_members (email, label, invite_code_hash, invite_expires_at, consumed_at, added_by)
  values (lower(p_email), p_label, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), now() + interval '7 days', null, auth.uid())
  on conflict (email) do update
    set label = excluded.label,
        invite_code_hash = excluded.invite_code_hash,
        invite_expires_at = excluded.invite_expires_at,
        consumed_at = null,
        added_by = excluded.added_by;
  insert into public.audit_log (actor_id, actor_device_id, action, meta)
  values (auth.uid(), public.current_device_id(), 'invite.create', jsonb_build_object('email', lower(p_email), 'label', p_label));
  return v_code;
end;
$$;
revoke execute on function public.create_invite(citext, public.member_label) from public, anon;
grant execute on function public.create_invite(citext, public.member_label) to authenticated;

-- The sealed wrap and verifier the Admin phone checks before approving a device. Audited.
create or replace function public.admin_key_material_for_approval(p_user_id uuid)
returns table (user_id uuid, mk_wrapped_admin text, mk_verifier text)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin_device();
  insert into public.audit_log (actor_id, actor_device_id, action, target_user_id)
  values (auth.uid(), public.current_device_id(), 'key_material.read_for_approval', p_user_id);
  return query
    select k.user_id, k.mk_wrapped_admin, k.mk_verifier
    from public.key_material k where k.user_id = p_user_id;
end;
$$;
revoke execute on function public.admin_key_material_for_approval(uuid) from public, anon;
grant execute on function public.admin_key_material_for_approval(uuid) to authenticated;

-- Admin assisted password reset: store the member MK sealed to one device's public key.
create or replace function public.create_recovery_grant(
  p_member_id uuid, p_device_id uuid, p_mk_sealed_for_device text, p_ttl interval default interval '1 hour')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
begin
  perform public.assert_admin_device();
  if not exists (select 1 from public.devices d where d.id = p_device_id and d.user_id = p_member_id) then
    raise exception 'device_not_owned_by_member' using errcode = '22023';
  end if;
  insert into public.recovery_grants (id, member_id, device_id, mk_sealed_for_device, created_by, expires_at)
  values (v_id, p_member_id, p_device_id, p_mk_sealed_for_device, auth.uid(), now() + p_ttl);
  insert into public.audit_log (actor_id, actor_device_id, action, target_user_id, meta)
  values (auth.uid(), public.current_device_id(), 'recovery_grant.create', p_member_id, jsonb_build_object('device_id', p_device_id, 'grant_id', v_id));
  return v_id;
end;
$$;
revoke execute on function public.create_recovery_grant(uuid, uuid, text, interval) from public, anon;
grant execute on function public.create_recovery_grant(uuid, uuid, text, interval) to authenticated;
