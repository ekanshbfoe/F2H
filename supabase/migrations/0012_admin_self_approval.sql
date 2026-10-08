-- 0012: Admin device self approval (spec 0001-admin-device-self-approval).
-- A pending Admin phone proves the paper recovery kit with an X25519 agreement tag. The server
-- keeps only sha256(tag) and an expiry on the pending row; a trigger clears both whenever the row
-- leaves `pending`, so no decision, cancel or expiry path can ever trip the check constraint.
-- answer_admin_challenge: compare, count, approve or reject, optional revoke of the other admin
--   phones and the audit rows in one transaction (service role only, called by self-approve-device).
-- admin_revoke_device: an Admin on an approved phone signs out any other approved phone.

alter table public.devices
  add column challenge_hash text null,
  add column challenge_expires_at timestamptz null,
  add column challenge_attempts smallint not null default 0,
  add column challenge_count smallint not null default 0,
  add constraint devices_challenge_only_pending check (challenge_hash is null or status = 'pending');
-- Not added to the authenticated column grant of 0010: neither RLS reads nor Realtime carry them.

create or replace function public.devices_clear_challenge() returns trigger
language plpgsql as $$
begin
  if new.status <> 'pending' and old.status = 'pending' then
    new.challenge_hash := null;
    new.challenge_expires_at := null;
  end if;
  return new;
end;
$$;
create trigger devices_clear_challenge
  before update on public.devices
  for each row execute function public.devices_clear_challenge();

create or replace function public.answer_admin_challenge(
  p_device_id uuid, p_tag_hash text, p_revoke_others boolean)
returns table (outcome text, attempts_left int)
language plpgsql security definer set search_path = public as $$
declare
  v_device public.devices%rowtype;
  v_expected bytea;
  v_given bytea;
  v_diff int := 0;
  v_attempts int;
  v_revoked int := 0;
  r record;
  i int;
begin
  if p_tag_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad_tag_hash' using errcode = '22023';
  end if;
  select * into v_device from public.devices d where d.id = p_device_id for update;
  if not found then
    raise exception 'device_not_found' using errcode = 'P0002';
  end if;
  if v_device.status <> 'pending' then
    raise exception 'device_not_pending' using errcode = 'P0001';
  end if;
  v_attempts := v_device.challenge_attempts;
  -- No open challenge, or one past its time: never a miss, the phone asks for a new one.
  if v_device.challenge_hash is null or v_device.challenge_expires_at is null
     or v_device.challenge_expires_at < now() then
    return query select 'expired'::text, 3 - v_attempts;
    return;
  end if;
  -- Constant time compare of the two 32 byte digests.
  v_expected := decode(v_device.challenge_hash, 'hex');
  v_given := decode(p_tag_hash, 'hex');
  for i in 0..31 loop
    v_diff := v_diff | (get_byte(v_expected, i) # get_byte(v_given, i));
  end loop;
  if v_diff = 0 then
    update public.devices d
      set status = 'approved', decided_at = now(), decided_by = v_device.user_id
      where d.id = p_device_id;
    if p_revoke_others then
      for r in
        update public.devices d
          set status = 'revoked', decided_at = now(), decided_by = v_device.user_id
          where d.user_id = v_device.user_id and d.status = 'approved' and d.id <> p_device_id
          returning d.id, d.model
      loop
        v_revoked := v_revoked + 1;
        insert into public.audit_log (actor_id, actor_device_id, action, target_user_id, meta)
        values (v_device.user_id, p_device_id, 'device.revoke', v_device.user_id,
                jsonb_build_object('device_id', r.id, 'model', r.model, 'reason', 'self_approve'));
      end loop;
    end if;
    insert into public.audit_log (actor_id, actor_device_id, action, target_user_id, meta)
    values (v_device.user_id, p_device_id, 'device.self_approve', v_device.user_id,
            jsonb_build_object('device_id', p_device_id, 'model', v_device.model,
                               'ip', host(v_device.last_ip), 'city', v_device.last_geo->>'city',
                               'revoked_others', v_revoked));
    return query select 'approved'::text, 3 - v_attempts;
    return;
  end if;
  v_attempts := v_attempts + 1;
  if v_attempts >= 3 then
    update public.devices d
      set status = 'rejected', decided_at = now(), decided_by = v_device.user_id,
          challenge_attempts = v_attempts
      where d.id = p_device_id;
    insert into public.audit_log (actor_id, actor_device_id, action, target_user_id, meta)
    values (v_device.user_id, p_device_id, 'device.self_approve_failed', v_device.user_id,
            jsonb_build_object('device_id', p_device_id, 'model', v_device.model,
                               'ip', host(v_device.last_ip), 'attempts', v_attempts));
    return query select 'rejected'::text, 0;
    return;
  end if;
  update public.devices d set challenge_attempts = v_attempts where d.id = p_device_id;
  return query select 'wrong'::text, 3 - v_attempts;
end;
$$;
revoke execute on function public.answer_admin_challenge(uuid, text, boolean) from public, anon, authenticated;

-- The Admin, on an approved phone, signs out any other approved phone of any member.
create or replace function public.admin_revoke_device(p_device_id uuid)
returns public.device_status
language plpgsql security definer set search_path = public as $$
declare
  v_device public.devices%rowtype;
begin
  if not (public.is_admin() and public.is_approved_device()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_device_id = public.current_device_id() then
    raise exception 'not_other_device' using errcode = '42501';
  end if;
  select * into v_device from public.devices d where d.id = p_device_id for update;
  if not found then
    raise exception 'device_not_found' using errcode = 'P0002';
  end if;
  if v_device.status <> 'approved' then
    raise exception 'device_not_approved' using errcode = 'P0001';
  end if;
  update public.devices d
    set status = 'revoked', decided_at = now(), decided_by = auth.uid()
    where d.id = p_device_id;
  insert into public.audit_log (actor_id, actor_device_id, action, target_user_id, meta)
  values (auth.uid(), public.current_device_id(), 'device.revoke', v_device.user_id,
          jsonb_build_object('device_id', p_device_id, 'model', v_device.model, 'reason', 'admin'));
  return 'revoked'::public.device_status;
end;
$$;
revoke execute on function public.admin_revoke_device(uuid) from public, anon;
grant execute on function public.admin_revoke_device(uuid) to authenticated;
