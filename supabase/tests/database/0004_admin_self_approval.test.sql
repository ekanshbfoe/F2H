-- pgTAP: admin device self approval (spec 0001-admin-device-self-approval, AC-4, AC-5, AC-6, AC-8).
-- The admin user is inserted with `on conflict do nothing` so a hosted run can swap in the real
-- Admin's id (one admin rule) without touching the rest of the file.
begin;
select plan(33);

create temporary table fx (name text primary key, uid uuid, token text);
insert into fx values
  ('admin', '11111111-1111-4111-8111-111111111111', encode(decode(repeat('01', 32), 'hex'), 'base64')),
  ('b',     '22222222-2222-4222-8222-222222222222', encode(decode(repeat('02', 32), 'hex'), 'base64')),
  ('c',     '66666666-6666-4666-8666-666666666666', encode(decode(repeat('06', 32), 'hex'), 'base64'));
grant select on fx to authenticated;
insert into auth.users (id, email) select uid, name || '@example.com' from fx on conflict (id) do nothing;
insert into public.profiles (id, email, display_name, role, status, kdf_params)
select uid, name || '@example.com', name, case when name = 'admin' then 'admin' else 'member' end::public.member_role,
       'active', '{"N":128,"r":8,"p":1,"dkLen":32}'::jsonb from fx
on conflict (id) do nothing;

-- admin: the lost phone (approved, holds the admin token) and the new phone (pending)
insert into public.devices (id, user_id, token_hash, registration_nonce, status, model)
select 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', uid, encode(sha256(decode(token, 'base64')), 'hex'), 'n-lost', 'approved', 'Lost phone' from fx where name = 'admin';
insert into public.devices (id, user_id, token_hash, registration_nonce, status, model, last_ip, last_geo)
select 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', uid, 'h-new', 'n-new', 'pending', 'New phone', '203.0.113.9', '{"city":"Delhi"}'::jsonb from fx where name = 'admin';
-- b: one approved phone (a revoke target) and one pending phone (the three wrong tags)
insert into public.devices (id, user_id, token_hash, registration_nonce, status, model)
select 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', uid, encode(sha256(decode(token, 'base64')), 'hex'), 'n-b1', 'approved', 'B phone' from fx where name = 'b';
insert into public.devices (id, user_id, token_hash, registration_nonce, status, model)
select 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', uid, 'h-b2', 'n-b2', 'pending', 'B new' from fx where name = 'b';
-- c: a pending phone with an open challenge that cancels its own request
insert into public.devices (id, user_id, token_hash, registration_nonce, status, model)
select 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', uid, encode(sha256(decode(token, 'base64')), 'hex'), 'n-c1', 'pending', 'C phone' from fx where name = 'c';

create function pg_temp.login(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select uid from fx where name = p_name), 'role', 'authenticated')::text, true);
  perform set_config('request.headers', json_build_object('x-f2h-device', (select token from fx where name = p_name))::text, true);
  execute 'set local role authenticated';
end $$;

create temporary table tags (name text primary key, hash text);
insert into tags values
  ('right', encode(sha256(decode(repeat('ab', 32), 'hex')), 'hex')),
  ('wrong', encode(sha256(decode(repeat('cd', 32), 'hex')), 'hex'));

-- Schema: the check constraint and the column grant (AC-8, invariants)
select throws_ok(
  $$update public.devices set challenge_hash = 'x' where id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'$$,
  '23514', null, 'a challenge cannot sit on an approved row');
select pg_temp.login('admin');
select throws_ok($$select challenge_hash from public.devices$$, '42501', null,
  'authenticated cannot read challenge_hash');
select throws_ok($$select challenge_attempts from public.devices$$, '42501', null,
  'authenticated cannot read challenge_attempts');

-- admin_revoke_device (AC-6), as the Admin on the approved lost phone
select throws_ok($$select public.admin_revoke_device('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1')$$, '42501', 'not_other_device',
  'the Admin cannot revoke the phone they are calling from');
select throws_ok($$select public.admin_revoke_device('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2')$$, 'P0001', 'device_not_approved',
  'a pending phone is not revoked, it is rejected through the inbox');
select throws_ok($$select public.admin_revoke_device('99999999-9999-4999-8999-999999999999')$$, 'P0002', 'device_not_found',
  'an unknown device id raises device_not_found');
select is(public.admin_revoke_device('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'), 'revoked'::public.device_status,
  'the Admin revokes a member''s approved phone');
select is((select status from public.devices where id = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'), 'revoked'::public.device_status,
  'the member''s row is revoked');
select is((select count(*)::int from public.audit_log where action = 'device.revoke'
           and meta->>'device_id' = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1' and meta->>'reason' = 'admin'), 1,
  'one device.revoke audit row with reason admin');
reset role;
select pg_temp.login('b');
select throws_ok($$select public.admin_revoke_device('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1')$$, '42501', 'admin_required',
  'a member cannot revoke anything');
select throws_ok($$select public.answer_admin_challenge('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', repeat('0', 64), false)$$, '42501', null,
  'authenticated cannot call answer_admin_challenge');
reset role;

-- answer_admin_challenge (AC-4, AC-5) with the service role semantics (superuser here)
select results_eq(
  $$select outcome, attempts_left from public.answer_admin_challenge('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', (select hash from tags where name = 'right'), false)$$,
  $$values ('expired'::text, 3)$$, 'no open challenge answers expired and costs nothing');
select throws_ok($$select public.answer_admin_challenge('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', 'nothex', false)$$, '22023', 'bad_tag_hash',
  'a malformed tag hash is refused');
update public.devices set challenge_hash = (select hash from tags where name = 'right'),
  challenge_expires_at = now() + interval '10 minutes', challenge_count = 1
  where id = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
select results_eq(
  $$select outcome, attempts_left from public.answer_admin_challenge('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', (select hash from tags where name = 'wrong'), false)$$,
  $$values ('wrong'::text, 2)$$, 'a wrong tag answers wrong with two tries left');
-- re-issued challenge keeps the miss
update public.devices set challenge_hash = (select hash from tags where name = 'right'),
  challenge_expires_at = now() + interval '10 minutes', challenge_count = 2
  where id = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
select is((select challenge_attempts::int from public.devices where id = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2'), 1,
  'a re-issued challenge keeps the miss count');
update public.devices set challenge_expires_at = now() - interval '1 second' where id = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
select results_eq(
  $$select outcome, attempts_left from public.answer_admin_challenge('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', (select hash from tags where name = 'right'), false)$$,
  $$values ('expired'::text, 2)$$, 'an expired challenge is never a miss');
update public.devices set challenge_expires_at = now() + interval '10 minutes' where id = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
select results_eq(
  $$select outcome, attempts_left from public.answer_admin_challenge('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', (select hash from tags where name = 'right'), true)$$,
  $$values ('approved'::text, 2)$$, 'the right tag approves');
select is((select status from public.devices where id = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2'), 'approved'::public.device_status,
  'the new phone is approved');
select is((select decided_by from public.devices where id = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2'), (select uid from fx where name = 'admin'),
  'decided_by is the Admin');
select ok((select challenge_hash is null and challenge_expires_at is null from public.devices where id = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2'),
  'the trigger cleared the challenge on approval');
select is((select status from public.devices where id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'), 'revoked'::public.device_status,
  'revoke_others signed out the lost phone in the same transaction');
select is((select status from public.profiles where id = (select uid from fx where name = 'admin')), 'active'::public.profile_status,
  'the profile is untouched');
select is((select count(*)::int from public.audit_log where action = 'device.self_approve'
           and actor_device_id = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2' and (meta->>'revoked_others')::int >= 1), 1,
  'one device.self_approve audit row counting the revoked phone');
select is((select count(*)::int from public.audit_log where action = 'device.revoke'
           and meta->>'device_id' = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1' and meta->>'reason' = 'self_approve'), 1,
  'one device.revoke audit row for the lost phone');
select throws_ok(
  $$select public.answer_admin_challenge('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', (select hash from tags where name = 'right'), false)$$,
  'P0001', 'device_not_pending', 'a second answer on the approved row raises device_not_pending (race)');
select throws_ok(
  $$select public.decide_device('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', 'approve', (select uid from fx where name = 'admin'), 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1')$$,
  'P0001', 'device_not_pending', 'decide_device after a self approval raises device_not_pending');

-- three wrong tags reject (AC-5), on b's pending row
update public.devices set challenge_hash = (select hash from tags where name = 'right'),
  challenge_expires_at = now() + interval '10 minutes', challenge_count = 1
  where id = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
select results_eq(
  $$select outcome, attempts_left from public.answer_admin_challenge('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', (select hash from tags where name = 'wrong'), false)$$,
  $$values ('wrong'::text, 2)$$, 'first wrong tag');
select results_eq(
  $$select outcome, attempts_left from public.answer_admin_challenge('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', (select hash from tags where name = 'wrong'), false)$$,
  $$values ('wrong'::text, 1)$$, 'second wrong tag');
select results_eq(
  $$select outcome, attempts_left from public.answer_admin_challenge('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', (select hash from tags where name = 'wrong'), false)$$,
  $$values ('rejected'::text, 0)$$, 'the third wrong tag rejects');
select ok((select status = 'rejected' and challenge_hash is null and challenge_attempts = 3 from public.devices where id = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2'),
  'the row is rejected with the challenge cleared and the count kept');
select is((select count(*)::int from public.audit_log where action = 'device.self_approve_failed' and actor_device_id = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2'), 1,
  'one device.self_approve_failed audit row');

-- the trigger on the cancel and expire paths (AC-8)
update public.devices set challenge_hash = (select hash from tags where name = 'right'),
  challenge_expires_at = now() + interval '10 minutes', challenge_count = 1
  where id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
select pg_temp.login('c');
select is(public.cancel_my_device('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'), 'expired'::public.device_status,
  'cancel_my_device succeeds with an open challenge');
reset role;
select ok((select challenge_hash is null and challenge_expires_at is null from public.devices where id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'),
  'the cancel path left the challenge columns null');

select * from finish();
rollback;
