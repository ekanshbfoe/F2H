import type { Href } from 'expo-router';

/**
 * Contacts routes in one place. The index href is cast once: Expo's typed routes list a group
 * index either as `/(app)/contacts` or `/(app)/contacts/index` depending on which dev server
 * wrote `.expo/types`, and the router accepts `/(app)/contacts` at runtime either way.
 */
export const CONTACTS_HREF = '/(app)/contacts' as Href;

export function contactHref(id: string): Href {
  return { pathname: '/(app)/contacts/[id]', params: { id } };
}

export function contactEditHref(id?: string): Href {
  return id ? { pathname: '/(app)/contacts/edit', params: { id } } : '/(app)/contacts/edit';
}

export const CONTACTS_IMPORT_HREF: Href = '/(app)/contacts/import';
