-- pgTAP: the isolation matrix from spec 0001-data-model-rls (AC-4, AC-5).
-- Run with `supabase test db` (needs the local stack).
begin;
select plan(23);

-- Fixtures -----------------------------------------------------------------
-- Device tokens are 32 bytes; the client sends them base64, the DB stores sha256 hex.
create temporary table fx (name text primary key, uid uuid, token text);
grant select on fx to authenticated; -- the pg_temp helpers read it after the role switch
insert into fx values
  ('admin', 'a0000000-0000-4000-8000-000000000001', encode(decode(repeat('aa', 32), 'hex'), 'base64')),
  ('a',     '11111111-1111-4111-8111-111111111111', encode(decode(repeat('01', 32), 'hex'), 'base64')),
  ('a_pending', null,                               encode(decode(repeat('02', 32), 'hex'), 'base64')),
  ('b',     '22222222-2222-4222-8222-222222222222', encode(decode(repeat('03', 32), 'hex'), 'base64'));

insert into auth.users (id, email) select uid, name || '@example.com' from fx where uid is not null;
insert into public.profiles (id, email, display_name, role, status, kdf_params)
select uid, name || '@example.com', name, case when name = 'admin' then 'admin' else 'member' end::public.member_role,
       'active', '{"N":128,"r":8,"p":1,"dkLen":32}'::jsonb
from fx where uid is not null;
insert into public.key_material (user_id, mk_wrapped_pw, mk_wrapped_admin, mk_verifier)
select uid, 'pw-' || name, 'admin-' || name, 'ver-' || name from fx where uid is not null;

insert into public.devices (id, user_id, token_hash, registration_nonce, status)
select gen_random_uuid(), uid, encode(sha256(decode(token, 'base64')), 'hex'), name, 'approved'
from fx where uid is not null;
insert into public.devices (id, user_id, token_hash, registration_nonce, status)
select gen_random_uuid(), (select uid from fx where name = 'a'), encode(sha256(decode(token, 'base64')), 'hex'), 'a-pending', 'pending'
from fx where name = 'a_pending';

insert into public.vault_items (id, owner_id, kind, dek_wrapped, ciphertext)
select gen_random_uuid(), uid, 'contact', 'dek', 'ct' from fx where name in ('a', 'b');
insert into public.file_blobs (id, owner_id, size_ct, sha256, chunk_size, total_chunks)
select decode(repeat(case name when 'a' then '0a' else '0b' end, 16), 'hex'), uid, 10, decode(repeat('ff', 32), 'hex'), 1, 1
from fx where name in ('a', 'b');
insert into public.audit_log (actor_id, action, target_user_id)
values ((select uid from fx where name = 'admin'), 'test.seed', (select uid from fx where name = 'a'));

-- Helper: act as a user with (or without) a device header.
create function pg_temp.login(p_name text, p_token text) returns void language plpgsql as $$
declare v_uid uuid;
begin
  select uid into v_uid from fx where name = p_name;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', case when p_token is null then '{}' else json_build_object('x-f2h-device', p_token)::text end, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.token(p_name text) returns text language sql as $$ select token from fx where name = p_name $$;
create function pg_temp.uid(p_name text) returns uuid language sql as $$ select uid from fx where name = p_name $$;

-- A from an approved device ---------------------------------------------------
select pg_temp.login('a', pg_temp.token('a'));
select ok(public.is_approved_device(), 'A approved device: is_approved_device() is true');
select is((select count(*)::int from public.vault_items), 1, 'A sees only own vault item');
select is((select owner_id from public.vault_items), pg_temp.uid('a'), 'and it is A''s');
select is((select count(*)::int from public.key_material), 1, 'A reads own key material');
select is((select count(*)::int from public.file_blobs), 1, 'A sees only own blob');
select is((select count(*)::int from public.devices), 2, 'A sees own two devices, not B''s');
select is((select count(*)::int from public.audit_log), 1, 'A sees the audit row that targets A');
reset role;

-- A without a header, with the pending token, with a wrong token --------------------
select pg_temp.login('a', null);
select ok(not public.is_approved_device(), 'no header: not approved');
select is((select count(*)::int from public.key_material), 0, 'no header: key material hidden');
select is((select count(*)::int from public.vault_items), 0, 'no header: vault items hidden');
select is((select count(*)::int from public.devices), 2, 'no header: own device rows still visible (realtime watch)');
reset role;

select pg_temp.login('a', pg_temp.token('a_pending'));
select ok(not public.is_approved_device(), 'pending token: not approved');
select is((select count(*)::int from public.key_material), 0, 'pending token: key material hidden');
select is((select count(*)::int from public.vault_items), 0, 'pending token: vault items hidden');
reset role;

select pg_temp.login('a', encode(decode(repeat('ee', 32), 'hex'), 'base64'));
select is((select count(*)::int from public.key_material), 0, 'wrong token: key material hidden');
reset role;

-- B from an approved device cannot see A -------------------------------------------
select pg_temp.login('b', pg_temp.token('b'));
select is((select owner_id from public.vault_items), pg_temp.uid('b'), 'B sees only B''s vault item');
select is((select user_id from public.key_material), pg_temp.uid('b'), 'B reads only B''s key material');
select is((select count(*)::int from public.devices where user_id = pg_temp.uid('a')), 0, 'B cannot see A''s devices');
reset role;

-- Admin: profiles and devices yes, vault items no ---------------------------------------
select pg_temp.login('admin', pg_temp.token('admin'));
select is((select count(*)::int from public.vault_items), 0, 'admin cannot select vault_items directly');
select is((select count(*)::int from public.profiles), 3, 'admin sees every profile');
select is((select count(*)::int from public.devices), 4, 'admin sees every device');
reset role;

-- audit_log is append only for everyone ---------------------------------------------------
select pg_temp.login('a', pg_temp.token('a'));
select throws_ok($$update public.audit_log set action = 'x'$$, '42501', null, 'member cannot update audit_log');
reset role;
set local role service_role;
select throws_ok($$delete from public.audit_log$$, '42501', null, 'service role cannot delete audit_log');
reset role;

select * from finish();
rollback;
