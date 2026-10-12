-- pgTAP: audit visibility (spec 0005, AC-5, AC-8). The admin uuid is swapped for the real Admin's
-- when this runs on the hosted project (one admin rule), like 0004.
begin;
select plan(6);

create temporary table fx (name text primary key, uid uuid, token text);
insert into fx values
  ('admin', '11111111-1111-4111-8111-111111111111', encode(decode(repeat('a1', 32), 'hex'), 'base64')),
  ('m1', 'f1000000-0000-4000-8000-0000000000f1', encode(decode(repeat('f1', 32), 'hex'), 'base64')),
  ('m2', 'f2000000-0000-4000-8000-0000000000f2', encode(decode(repeat('f2', 32), 'hex'), 'base64'));
grant select on fx to authenticated;
insert into auth.users (id, email) select uid, name || '@audit.example' from fx on conflict (id) do nothing;
insert into public.profiles (id, email, display_name, role, status, kdf_params)
select uid, name || '@audit.example', name, case when name = 'admin' then 'admin' else 'member' end::public.member_role,
       'active', '{"N":128,"r":8,"p":1,"dkLen":32}'::jsonb from fx
on conflict (id) do nothing;

insert into public.audit_log (actor_id, action, target_user_id, meta) values
  ((select uid from fx where name = 'admin'), 'oversight.open', (select uid from fx where name = 'm1'), '{"t":"pg"}'),
  ((select uid from fx where name = 'm2'), 'file.upload', (select uid from fx where name = 'm2'), '{"t":"pg"}'),
  ((select uid from fx where name = 'm1'), 'file.delete', (select uid from fx where name = 'm1'), '{"t":"pg"}');

create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select uid from fx where name = p_name), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.login('m1');
select is((select count(*)::int from public.audit_log where meta->>'t' = 'pg'), 2, 'm1 sees the oversight row about them and their own row');
select is((select count(*)::int from public.audit_log where meta->>'t' = 'pg' and action = 'oversight.open'), 1, 'm1 sees that the Admin opened their vault');
select is((select count(*)::int from public.audit_log where meta->>'t' = 'pg' and actor_id = (select uid from fx where name = 'm2')), 0, 'm1 sees nothing about m2');
select throws_ok($$insert into public.audit_log (action) values ('forged')$$, '42501', null, 'a member cannot write the audit log');
select throws_ok($$delete from public.audit_log where meta->>'t' = 'pg'$$, '42501', null, 'a member cannot delete the audit log');
reset role;

select pg_temp.login('admin');
select is((select count(*)::int from public.audit_log where meta->>'t' = 'pg'), 3, 'the Admin sees every row');
reset role;

select * from finish();
rollback;
