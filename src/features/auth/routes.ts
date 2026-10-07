import type { AuthRoute } from './api';

/** Maps a gate outcome to the screen that shows it. */
export const AUTH_ROUTES = {
  login: '/(auth)/login',
  waiting: '/(auth)/waiting',
  rejected: '/(auth)/denied?reason=rejected',
  expired: '/(auth)/denied?reason=expired',
  'recovery-kit': '/(admin)/recovery-kit',
  home: '/(app)/home',
} as const satisfies Record<AuthRoute, string>;

export function pathFor(route: AuthRoute): (typeof AUTH_ROUTES)[AuthRoute] {
  return AUTH_ROUTES[route];
}

/** Human copy for the errors the auth flows raise. */
export function describeAuthError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const detail = (error as { message?: string } | null)?.message ?? '';
  switch (code) {
    case 'bad_credentials':
      return 'That email and password do not match.';
    case 'bad_invite':
      return 'That invite code is not valid, was already used, or has expired. Ask the Admin for a new one.';
    case 'email_exists':
      return 'An account with this email already exists. Try logging in instead.';
    case 'no_recovery_key':
      return 'The Admin has not finished setting up F2H yet. Ask them to open the app first.';
    case 'pending_exists':
      return 'A request for this account is already waiting for the Admin.';
    case 'network':
      return 'Could not reach the vault (' + detail + '). Check your connection and try again.';
    case 'auth_unreachable':
      return (
        'Could not reach Supabase Auth (' +
        detail +
        '). On an older phone this is often a certificate problem; try the same login on another phone.'
      );
    case 'function_failed':
      return (
        'The vault refused the request (' +
        detail +
        '). Check the function logs in the Supabase dashboard.'
      );
    case 'not_released':
      return 'Key material is not available for this device yet.';
    case 'verifier_failed':
    case 'bad_wrap':
      return 'The stored key material does not match this password. Contact the Admin.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
