-- pgTAP: credential vault isolation and the version guard (spec 0004, AC-6, AC-7).
-- Members only (no admin row), so the file runs unchanged on the hosted project.
begin;
select plan(12);

create temporary table fx (name text primary key, uid uuid, token text);
insert into fx values
  ('a', 'd0000000-0000-4000-8000-00000000000a', encode(decode(repeat('1a', 32), 'hex'), 'base64')),
  ('b', 'd0000000-0000-4000-8000-00000000000b', encode(decode(repeat('1b', 32), 'hex'), 'base64')),
  ('a_pending', null, encode(decode(repeat('1c', 32), 'hex'), 'base64'));
grant select on fx to authenticated;
insert into auth.users (id, email) select uid, name || '@example.com' from fx where uid is not null;
insert into public.profiles (id, email, display_name, status, kdf_params)
select uid, name || '@example.com', name, 'active', '{"N":128,"r":8,"p":1,"dkLen":32}'::jsonb from fx where uid is not null;
insert into public.devices (id, user_id, token_hash, registration_nonce, status)
select gen_random_uuid(), uid, encode(sha256(decode(token, 'base64')), 'hex'), 'n-' || name, 'approved' from fx where uid is not null;
insert into public.devices (id, user_id, token_hash, registration_nonce, status)
select gen_random_uuid(), (select uid from fx where name = 'a'), encode(sha256(decode(token, 'base64')), 'hex'), 'n-pending', 'pending'
from fx where name = 'a_pending';

create function pg_temp.login(p_user text, p_token text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select uid from fx where name = p_user), 'role', 'authenticated')::text, true);
  perform set_config('request.headers', json_build_object('x-f2h-device', (select token from fx where name = p_token))::text, true);
  execute 'set local role authenticated';
end $$;

-- a writes two credentials from the approved phone
select pg_temp.login('a', 'a');
insert into public.vault_items (id, owner_id, kind, dek_wrapped, ciphertext) values
  ('d1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000a', 'credential', 'dek', 'ct1'),
  ('d1000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-00000000000a', 'credential', 'dek', 'ct2');
select is((select count(*)::int from public.vault_items where kind = 'credential'), 2, 'a reads both own credentials');
select throws_ok(
  $$insert into public.vault_items (id, owner_id, kind, dek_wrapped, ciphertext)
    values ('d1000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-00000000000b', 'credential', 'dek', 'x')$$,
  '42501', null, 'a cannot write a credential into b''s vault');

-- version guard: the right version moves to 2, a stale one is refused
update public.vault_items set ciphertext = 'ct1b', version = 1 where id = 'd1000000-0000-4000-8000-000000000001';
select is((select version from public.vault_items where id = 'd1000000-0000-4000-8000-000000000001'), 2, 'an edit with the current version lands as version 2');
select throws_ok(
  $$update public.vault_items set ciphertext = 'stale', version = 1 where id = 'd1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'stale_version', 'an edit with a stale version is refused');

-- soft delete keeps the row, the client filters deleted_at
update public.vault_items set deleted_at = now(), version = 1 where id = 'd1000000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.vault_items where kind = 'credential' and deleted_at is null), 1, 'a soft deleted credential drops out of the live list');
select is((select count(*)::int from public.vault_items where kind = 'credential'), 2, 'the soft deleted row is still there');
reset role;

-- b sees none of a's credentials and cannot change them
select pg_temp.login('b', 'b');
select is((select count(*)::int from public.vault_items where kind = 'credential'), 0, 'b reads none of a''s credentials');
select lives_ok($$update public.vault_items set ciphertext = 'pwned', version = 2 where id = 'd1000000-0000-4000-8000-000000000001'$$,
  'b''s update runs but matches no row');
select lives_ok($$delete from public.vault_items where id = 'd1000000-0000-4000-8000-000000000001'$$,
  'b''s delete runs but matches no row');
reset role;
select is((select ciphertext from public.vault_items where id = 'd1000000-0000-4000-8000-000000000001'), 'ct1b', 'a''s credential is untouched by b');

-- a's own pending phone sees nothing; a with no device header sees nothing
select pg_temp.login('a', 'a_pending');
select is((select count(*)::int from public.vault_items), 0, 'a pending phone of a reads no credentials');
reset role;
select pg_temp.login('a', 'b');
select is((select count(*)::int from public.vault_items), 0, 'a with another member''s device token reads no credentials');
reset role;

select * from finish();
rollback;
