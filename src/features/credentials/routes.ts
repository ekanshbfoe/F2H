import type { Href } from 'expo-router';

/** Credentials routes in one place (see `contacts/routes.ts` for why the index href is cast). */
export const CREDENTIALS_HREF = '/(app)/credentials' as Href;

export function credentialHref(id: string): Href {
  return { pathname: '/(app)/credentials/[id]', params: { id } };
}

export function credentialEditHref(id?: string): Href {
  return id ? { pathname: '/(app)/credentials/edit', params: { id } } : '/(app)/credentials/edit';
}
