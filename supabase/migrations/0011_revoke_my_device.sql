-- 0011: app lock (spec 0002). A phone that is about to wipe itself (tenth wrong PIN, forgot PIN)
-- tells the server first: the owner, proven by the device header, moves its own approved device
-- to revoked. Best effort from the client; the local wipe happens regardless.

create or replace function public.revoke_my_device(p_device_id uuid)
returns public.device_status
language plpgsql security definer set search_path = public as $$
declare
  v_status public.device_status;
begin
  if p_device_id is distinct from public.current_device_id() then
    raise exception 'not_this_device' using errcode = '42501';
  end if;
  update public.devices d
    set status = 'revoked', decided_at = now(), decided_by = auth.uid()
    where d.id = p_device_id and d.user_id = auth.uid() and d.status = 'approved'
    returning d.status into v_status;
  if v_status is null then
    raise exception 'device_not_approved' using errcode = 'P0001';
  end if;
  insert into public.audit_log (actor_id, actor_device_id, action, target_user_id, meta)
  values (auth.uid(), p_device_id, 'device.self_revoke', auth.uid(),
    jsonb_build_object('device_id', p_device_id));
  return v_status;
end;
$$;
revoke execute on function public.revoke_my_device(uuid) from public, anon;
grant execute on function public.revoke_my_device(uuid) to authenticated;
