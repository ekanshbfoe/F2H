-- Local development seed (applied by `supabase db reset`, never on the hosted project).
-- Three allowlisted member emails. The Admin is created by `npm run bootstrap:admin`.
insert into public.allowed_members (email, label)
values
  ('father@example.com', 'father'),
  ('mother@example.com', 'mother'),
  ('brother@example.com', 'brother')
on conflict (email) do nothing;
