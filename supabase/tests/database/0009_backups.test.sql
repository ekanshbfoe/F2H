-- pgTAP: backups are Admin read only and the snapshot helper is service role only (spec 0006,
-- AC-5, AC-7). The admin uuid is swapped for the real Admin's on the hosted project.
begin;
select plan(5);

create temporary table fx (name text primary key, uid uuid, token text);
insert into fx values
  ('admin', '11111111-1111-4111-8111-111111111111', encode(decode(repeat('b1', 32), 'hex'), 'base64')),
  ('m1', 'f3000000-0000-4000-8000-0000000000f3', encode(decode(repeat('b3', 32), 'hex'), 'base64'));
grant select on fx to authenticated;
insert into auth.users (id, email) select uid, name || '@backup.example' from fx on conflict (id) do nothing;
insert into public.profiles (id, email, display_name, role, status, kdf_params)
select uid, name || '@backup.example', name, case when name = 'admin' then 'admin' else 'member' end::public.member_role,
       'active', '{"N":128,"r":8,"p":1,"dkLen":32}'::jsonb from fx
on conflict (id) do nothing;
insert into public.backups (id, taken_at, size, state) values (gen_random_uuid(), now(), 123, 'ok');

create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select uid from fx where name = p_name), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.login('m1');
select is((select count(*)::int from public.backups where size = 123), 0, 'a member sees no backups');
select throws_ok($$insert into public.backups (id, size) values (gen_random_uuid(), 1)$$, '42501', null, 'a member cannot add a backup row');
select throws_ok($$select public.backup_auth_rows()$$, '42501', null, 'a member cannot read the auth rows');
reset role;

select pg_temp.login('admin');
select is((select count(*)::int from public.backups where size = 123), 1, 'the Admin sees the backup row');
select throws_ok($$delete from public.backups where size = 123$$, '42501', null, 'not even the Admin deletes backup rows from the phone');
reset role;

select * from finish();
rollback;
