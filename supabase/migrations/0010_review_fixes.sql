-- 0010: fixes from the auth & device gate review.
-- 1. Clients never read registration_nonce or token_hash: the nonce would otherwise let a password
--    holder replay a device registration. Column grants apply to PostgREST and to Realtime payloads.
-- 2. cancel_my_device: the waiting phone closes its own pending request (proven by its token).

revoke select on public.devices from authenticated;
grant select (
  id, user_id, name, model, os, app_version, pubkey, push_token, status,
  requested_at, decided_at, decided_by, last_ip, last_geo, last_seen_at, created_at
) on public.devices to authenticated;

create or replace function public.cancel_my_device(p_device_id uuid)
returns public.device_status
language plpgsql security definer set search_path = public as $$
declare
  v_status public.device_status;
begin
  if p_device_id is distinct from public.current_device_id() then
    raise exception 'not_this_device' using errcode = '42501';
  end if;
  update public.devices d
    set status = 'expired', decided_at = now()
    where d.id = p_device_id and d.user_id = auth.uid() and d.status = 'pending'
    returning d.status into v_status;
  if v_status is null then
    raise exception 'device_not_pending' using errcode = 'P0001';
  end if;
  insert into public.audit_log (actor_id, actor_device_id, action, target_user_id, meta)
  values (auth.uid(), p_device_id, 'device.cancel', auth.uid(), jsonb_build_object('device_id', p_device_id));
  return v_status;
end;
$$;
revoke execute on function public.cancel_my_device(uuid) from public, anon;
grant execute on function public.cancel_my_device(uuid) to authenticated;
