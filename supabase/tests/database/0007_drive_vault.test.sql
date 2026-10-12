-- pgTAP: Drive refresh tokens live only in Vault and only the service role reaches them
-- (child spec 0001-drive-redundancy, AC-1, AC-2). Runs inside a transaction; the Vault rows roll back.
begin;
select plan(9);

create temporary table fx (uid uuid);
insert into fx values ('e0000000-0000-4000-8000-00000000000e');
grant select on fx to authenticated;
insert into auth.users (id, email) select uid, 'drive-test@example.com' from fx;
insert into public.profiles (id, email, display_name, status, kdf_params)
select uid, 'drive-test@example.com', 'drive test', 'active', '{"N":128,"r":8,"p":1,"dkLen":32}'::jsonb from fx;

-- the service role path (superuser here) links slot b twice: the second call updates the same secret
select lives_ok($$select public.drive_link_account('b', 'father@example.com', 'refresh-1', 'root-1', (select uid from fx))$$,
  'linking slot b stores the account');
select is(public.drive_refresh_token('b'), 'refresh-1', 'the refresh token reads back from Vault');
select is((select count(*)::int from public.drive_accounts where slot = 'b' and status = 'active'), 1, 'one active slot b row');
select lives_ok($$select public.drive_link_account('b', 'father@example.com', 'refresh-2', 'root-1', (select uid from fx))$$,
  'linking again updates in place');
select is(public.drive_refresh_token('b'), 'refresh-2', 'the new refresh token replaced the old one');
select is((select count(*)::int from vault.secrets where name = 'drive_refresh_b'), 1, 'still a single Vault secret for slot b');
select ok(public.drive_mark_relink('b') and not public.drive_mark_relink('b'),
  'needs_relink is set once and reported once');
select throws_ok($$select public.drive_link_account('c', 'x', 'y', 'z', null)$$, '22023', 'bad_slot', 'only slots a and b exist');

-- a signed in member reaches none of it
select set_config('request.jwt.claims', json_build_object('sub', (select uid from fx), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$select public.drive_refresh_token('b')$$, '42501', null, 'authenticated cannot read a refresh token');
reset role;

select * from finish();
rollback;
