-- 0009: RPCs for the account and device gate (spec 0001-account-and-device-gate).
-- decide_device: approve or reject in one transaction (service role only, called by approve-device).
-- admin_first_run: publish the recovery public key and create the Admin's key material once.
-- recovery_pubkey: public read of the recovery public key for the signup screen (anon).
-- create_invite: replaced with a full 32 character Crockford alphabet (0008 had 30, so some codes were short).

create or replace function public.decide_device(
  p_device_id uuid, p_decision text, p_admin_id uuid, p_admin_device_id uuid)
returns table (status public.device_status, user_id uuid, push_token text, display_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_device public.devices%rowtype;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'bad_decision' using errcode = '22023';
  end if;
  select * into v_device from public.devices d where d.id = p_device_id for update;
  if not found then
    raise exception 'device_not_found' using errcode = 'P0002';
  end if;
  if v_device.status <> 'pending' then
    raise exception 'device_not_pending' using errcode = 'P0001';
  end if;
  if p_decision = 'approve' then
    update public.devices d set status = 'approved', decided_at = now(), decided_by = p_admin_id where d.id = p_device_id;
    update public.profiles p set status = 'active', activated_at = coalesce(p.activated_at, now())
      where p.id = v_device.user_id and p.status = 'pending';
  else
    update public.devices d set status = 'rejected', decided_at = now(), decided_by = p_admin_id where d.id = p_device_id;
  end if;
  insert into public.audit_log (actor_id, actor_device_id, action, target_user_id, meta)
  values (p_admin_id, p_admin_device_id, 'device.' || p_decision, v_device.user_id,
          jsonb_build_object('device_id', p_device_id, 'model', v_device.model));
  return query
    select d.status, d.user_id, d.push_token, p.display_name
    from public.devices d join public.profiles p on p.id = d.user_id
    where d.id = p_device_id;
end;
$$;
revoke execute on function public.decide_device(uuid, text, uuid, uuid) from public, anon, authenticated;

-- One time Admin setup from the first approved Admin device: recovery public key + fingerprint into
-- family_config, and the Admin's own wrapped Master Key into key_material. Refuses a second run.
create or replace function public.admin_first_run(
  p_recovery_pub text, p_fingerprint text, p_mk_wrapped_pw text, p_mk_wrapped_admin text, p_mk_verifier text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin_device();
  if exists (select 1 from public.family_config f where f.id = 1 and f.admin_recovery_pubkey is not null) then
    raise exception 'already_initialized' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.key_material k where k.user_id = auth.uid()) then
    raise exception 'key_material_exists' using errcode = 'P0001';
  end if;
  update public.family_config
    set admin_recovery_pubkey = decode(p_recovery_pub, 'base64'),
        recovery_fingerprint = p_fingerprint,
        updated_at = now()
    where id = 1;
  insert into public.key_material (user_id, mk_wrapped_pw, mk_wrapped_admin, mk_verifier, updated_by_device)
  values (auth.uid(), p_mk_wrapped_pw, p_mk_wrapped_admin, p_mk_verifier, public.current_device_id());
  insert into public.audit_log (actor_id, actor_device_id, action, target_user_id, meta)
  values (auth.uid(), public.current_device_id(), 'admin.first_run', auth.uid(),
          jsonb_build_object('fingerprint', p_fingerprint));
end;
$$;
revoke execute on function public.admin_first_run(text, text, text, text, text) from public, anon;
grant execute on function public.admin_first_run(text, text, text, text, text) to authenticated;

-- The recovery public key is public by design: the signup screen seals the new Master Key to it and
-- shows the fingerprint for an out of band check with the Admin.
create or replace function public.recovery_pubkey()
returns table (recovery_pub text, fingerprint text)
language sql stable security definer set search_path = public as $$
  select encode(f.admin_recovery_pubkey, 'base64'), f.recovery_fingerprint
  from public.family_config f where f.id = 1 and f.admin_recovery_pubkey is not null;
$$;
grant execute on function public.recovery_pubkey() to anon, authenticated;

create or replace function public.create_invite(p_email citext, p_label public.member_label)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; -- Crockford base32, 32 symbols
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

-- Members and their devices for the Admin screens: a sanitized view (no hashes, no nonces).
create or replace view public.member_devices_view as
  select d.id, d.user_id, p.display_name, p.email, p.role, p.status as profile_status,
         d.name, d.model, d.os, d.app_version, d.status, d.requested_at, d.decided_at,
         d.last_geo, d.last_seen_at, encode(d.pubkey, 'base64') as pubkey
  from public.devices d join public.profiles p on p.id = d.user_id
  where public.is_admin() and public.is_approved_device();
grant select on public.member_devices_view to authenticated;
