-- pgTAP: triggers, constraints and column grants (AC-6, AC-7, version guard).
begin;
select plan(10);

create temporary table fx (name text primary key, uid uuid, token text);
insert into fx values
  ('a', '11111111-1111-4111-8111-111111111111', encode(decode(repeat('01', 32), 'hex'), 'base64'));
insert into auth.users (id, email) select uid, 'a@example.com' from fx;
insert into public.profiles (id, email, display_name, status, kdf_params)
select uid, 'a@example.com', 'a', 'active', '{"N":128,"r":8,"p":1,"dkLen":32}'::jsonb from fx;
insert into public.key_material (user_id, mk_wrapped_pw, mk_wrapped_admin, mk_verifier)
select uid, 'pw', 'admin', 'ver' from fx;
insert into public.devices (id, user_id, token_hash, registration_nonce, status)
select '33333333-3333-4333-8333-333333333333', uid, encode(sha256(decode(token, 'base64')), 'hex'), 'n1', 'approved' from fx;
insert into public.vault_items (id, owner_id, kind, dek_wrapped, ciphertext)
select '44444444-4444-4444-8444-444444444444', uid, 'note', 'dek', 'ct' from fx;

create function pg_temp.login_a() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select uid from fx), 'role', 'authenticated')::text, true);
  perform set_config('request.headers', json_build_object('x-f2h-device', (select token from fx))::text, true);
  execute 'set local role authenticated';
end $$;

-- AC-7: realtime publication and one pending device per user
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'devices'),
  'devices is in the supabase_realtime publication');
insert into public.devices (id, user_id, token_hash, registration_nonce, status)
select gen_random_uuid(), uid, 'h1', 'n2', 'pending' from fx;
select throws_ok(
  $$insert into public.devices (id, user_id, token_hash, registration_nonce, status)
    select gen_random_uuid(), uid, 'h2', 'n3', 'pending' from fx$$,
  '23505', null, 'a second pending device for the same user is refused');

-- AC-6: key_material update writes an audit row, with the device resolved from the header
select pg_temp.login_a();
update public.key_material set mk_verifier = 'ver2';
select is((select count(*)::int from public.audit_log where action = 'key_material.update'), 1,
  'key_material update wrote one audit row');
select is((select actor_device_id from public.audit_log where action = 'key_material.update'),
  '33333333-3333-4333-8333-333333333333'::uuid, 'audit row names the calling device');
select is((select meta->'changed' from public.audit_log where action = 'key_material.update'),
  '["mk_verifier"]'::jsonb, 'audit row lists the changed column');

-- version guard: the client sends the version it read
update public.vault_items set ciphertext = 'ct2', version = 1;
select is((select version from public.vault_items), 2, 'a matching version advances to 2');
select throws_ok($$update public.vault_items set ciphertext = 'ct3', version = 1$$, 'P0001', 'stale_version',
  'a stale version is refused');

-- column grants: only display_name on profiles, only push_token/name/last_seen_at on devices
update public.profiles set display_name = 'Alice';
select is((select display_name from public.profiles), 'Alice', 'member can rename themselves');
select throws_ok($$update public.profiles set role = 'admin'$$, '42501', null, 'member cannot change their role');
select throws_ok($$update public.devices set status = 'approved'$$, '42501', null, 'member cannot approve their own device');
reset role;

select * from finish();
rollback;
