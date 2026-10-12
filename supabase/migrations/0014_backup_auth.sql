-- 0014: backups (spec 0006). The nightly snapshot also carries the auth rows a restored project
-- needs so the family can log in with their existing passwords. `encrypted_password` is a bcrypt
-- of the derived 256 bit auth secret (never the password itself), and the whole snapshot is
-- sealed to the recovery key. Only the service role (the backup function) may call this.

create or replace function public.backup_auth_rows()
returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'email', u.email, 'encrypted_password', u.encrypted_password,
        'email_confirmed_at', u.email_confirmed_at, 'raw_app_meta_data', u.raw_app_meta_data,
        'raw_user_meta_data', u.raw_user_meta_data, 'created_at', u.created_at) order by u.created_at)
      from auth.users u), '[]'::jsonb),
    'identities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'user_id', i.user_id, 'provider', i.provider, 'provider_id', i.provider_id,
        'identity_data', i.identity_data, 'created_at', i.created_at) order by i.created_at)
      from auth.identities i), '[]'::jsonb)
  );
$$;
revoke execute on function public.backup_auth_rows() from public, anon, authenticated;
