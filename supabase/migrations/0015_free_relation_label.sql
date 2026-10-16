-- 0015: the relation on an invite is the Admin's own words (Sister, Uncle, Mum), not one of three
-- fixed labels. `admin` stays reserved for the bootstrap row and stays unique.
alter table public.allowed_members alter column label type text using label::text;
drop index if exists public.allowed_members_one_per_label;
alter table public.allowed_members
  add constraint allowed_members_label_length check (char_length(btrim(label)) between 1 and 30);
create unique index allowed_members_one_admin on public.allowed_members (label) where label = 'admin';

drop function if exists public.create_invite(citext, public.member_label);
drop type if exists public.member_label;

create or replace function public.create_invite(p_email citext, p_label text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; -- Crockford base32, 32 symbols
  v_label text := btrim(coalesce(p_label, ''));
  v_code text := '';
  v_bytes bytea := extensions.gen_random_bytes(8);
  i int;
begin
  perform public.assert_admin_device();
  if lower(v_label) = 'admin' then
    raise exception 'cannot_invite_admin' using errcode = '22023';
  end if;
  if char_length(v_label) not between 1 and 30 then
    raise exception 'relation_length' using errcode = '22023';
  end if;
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  insert into public.allowed_members (email, label, invite_code_hash, invite_expires_at, consumed_at, added_by)
  values (lower(p_email), v_label, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), now() + interval '7 days', null, auth.uid())
  on conflict (email) do update
    set label = excluded.label,
        invite_code_hash = excluded.invite_code_hash,
        invite_expires_at = excluded.invite_expires_at,
        consumed_at = null,
        added_by = excluded.added_by;
  insert into public.audit_log (actor_id, actor_device_id, action, meta)
  values (auth.uid(), public.current_device_id(), 'invite.create', jsonb_build_object('email', lower(p_email), 'label', v_label));
  return v_code;
end;
$$;
revoke execute on function public.create_invite(citext, text) from public, anon;
grant execute on function public.create_invite(citext, text) to authenticated;
