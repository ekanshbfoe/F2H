-- 0006: append only audit_log, the device id helper and the key_material audit trigger. (AC-6)

create table public.audit_log (
  id bigserial primary key,
  actor_id uuid null,
  actor_device_id uuid null,
  action text not null,
  target_user_id uuid null,
  target_item_id uuid null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_actor on public.audit_log (actor_id, created_at desc);
create index audit_log_target on public.audit_log (target_user_id, created_at desc);

-- Nobody edits history: not clients, not functions.
revoke update, delete, truncate on public.audit_log from public, anon, authenticated, service_role;

-- The device token hash from the lowercase x-f2h-device request header, or null.
create or replace function public.request_device_token_hash() returns text
language sql stable as $$
  select case
    when coalesce(current_setting('request.headers', true)::json->>'x-f2h-device', '') = '' then null
    else encode(sha256(decode(current_setting('request.headers', true)::json->>'x-f2h-device', 'base64')), 'hex')
  end;
$$;

-- The caller's device row id when the header names one of their devices (any status), else null.
create or replace function public.current_device_id() returns uuid
language sql stable security definer set search_path = public as $$
  select d.id from public.devices d
  where d.user_id = auth.uid() and d.token_hash = public.request_device_token_hash()
  limit 1;
$$;
revoke execute on function public.request_device_token_hash() from public, anon;
revoke execute on function public.current_device_id() from public, anon;

create or replace function public.key_material_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, actor_device_id, action, target_user_id, meta)
  values (
    auth.uid(),
    public.current_device_id(),
    'key_material.update',
    new.user_id,
    jsonb_build_object(
      'changed', array_remove(array[
        case when new.mk_wrapped_pw is distinct from old.mk_wrapped_pw then 'mk_wrapped_pw' end,
        case when new.mk_wrapped_admin is distinct from old.mk_wrapped_admin then 'mk_wrapped_admin' end,
        case when new.mk_verifier is distinct from old.mk_verifier then 'mk_verifier' end
      ], null),
      'updated_by_device', new.updated_by_device
    )
  );
  return new;
end;
$$;

create or replace function public.key_material_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger key_material_touch before update on public.key_material
  for each row execute function public.key_material_touch();
create trigger key_material_audit after update on public.key_material
  for each row execute function public.key_material_audit();
