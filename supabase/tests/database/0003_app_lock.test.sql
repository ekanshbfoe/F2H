-- pgTAP: revoke_my_device (spec 0002, AC-5 server part).
begin;
select plan(6);

create temporary table fx (name text primary key, uid uuid, token text);
insert into fx values
  ('a', '11111111-1111-4111-8111-111111111111', encode(decode(repeat('01', 32), 'hex'), 'base64')),
  ('b', '22222222-2222-4222-8222-222222222222', encode(decode(repeat('02', 32), 'hex'), 'base64'));
grant select on fx to authenticated;
insert into auth.users (id, email) select uid, name || '@example.com' from fx;
insert into public.profiles (id, email, display_name, status, kdf_params)
select uid, name || '@example.com', name, 'active', '{"N":128,"r":8,"p":1,"dkLen":32}'::jsonb from fx;
-- a: one approved device (the caller) and one pending device
insert into public.devices (id, user_id, token_hash, registration_nonce, status)
select '33333333-3333-4333-8333-333333333333', uid, encode(sha256(decode(token, 'base64')), 'hex'), 'n1', 'approved' from fx where name = 'a';
insert into public.devices (id, user_id, token_hash, registration_nonce, status)
select '55555555-5555-4555-8555-555555555555', uid, 'h-pending', 'n3', 'pending' from fx where name = 'a';
-- b: an approved device that a must not touch
insert into public.devices (id, user_id, token_hash, registration_nonce, status)
select '44444444-4444-4444-8444-444444444444', uid, encode(sha256(decode(token, 'base64')), 'hex'), 'n2', 'approved' from fx where name = 'b';

create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select uid from fx where name = p_name), 'role', 'authenticated')::text, true);
  perform set_config('request.headers', json_build_object('x-f2h-device', (select token from fx where name = p_name))::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.login('a');
select throws_ok($$select public.revoke_my_device('44444444-4444-4444-8444-444444444444')$$, '42501', 'not_this_device',
  'a cannot revoke another member''s device');
select throws_ok($$select public.revoke_my_device('55555555-5555-4555-8555-555555555555')$$, '42501', 'not_this_device',
  'a cannot revoke a device whose token it does not hold');
select is(public.revoke_my_device('33333333-3333-4333-8333-333333333333'), 'revoked'::public.device_status,
  'a revokes its own approved device');
select is((select status from public.devices where id = '33333333-3333-4333-8333-333333333333'), 'revoked'::public.device_status,
  'the row is revoked');
select is((select count(*)::int from public.audit_log where action = 'device.self_revoke' and actor_device_id = '33333333-3333-4333-8333-333333333333'), 1,
  'one self revoke audit row');
select throws_ok($$select public.revoke_my_device('33333333-3333-4333-8333-333333333333')$$, 'P0001', 'device_not_approved',
  'a device that is no longer approved cannot be revoked twice');
reset role;

select * from finish();
rollback;
