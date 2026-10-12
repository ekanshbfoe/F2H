import { z } from 'zod';

import type { StoredItem } from '@/features/vault/items';

/** Credential vault model (spec 0004). Pure functions only. */

export const CATEGORIES = ['bank', 'email', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  bank: 'Bank',
  email: 'Email',
  other: 'Other',
};

export const TITLE_MAX = 80;
export const USERNAME_MAX = 200;
export const PASSWORD_MAX = 256;
export const URL_MAX = 300;
export const FIELD_MAX = 8;
export const FIELD_LABEL_MAX = 40;
export const FIELD_VALUE_MAX = 500;
export const NOTE_MAX = 1000;
/** Shown for every hidden secret; never the real length. */
export const MASK = '••••••••';
export const BANK_STARTER_FIELDS = ['Customer ID', 'Account number'] as const;

/** Adds `https://` when no scheme is typed; null for anything that is not http(s). */
export function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  if (!/^https?:\/\//i.test(withScheme)) return null;
  const host = hostOf(withScheme);
  return host ? withScheme : null;
}

/** The lower case host of an http(s) URL, or '' when there is none. */
export function hostOf(url: string): string {
  const m = /^https?:\/\/([^/?#:]+)/i.exec(url.trim());
  const host = (m?.[1] ?? '').toLowerCase();
  return host.includes('.') || host === 'localhost' ? host : '';
}

const fieldSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Name this field')
    .max(FIELD_LABEL_MAX, `Up to ${FIELD_LABEL_MAX} characters`),
  value: z.string().max(FIELD_VALUE_MAX, `Up to ${FIELD_VALUE_MAX} characters`),
  secret: z.boolean(),
});

export const credentialPayloadSchema = z
  .object({
    v: z.literal(1),
    type: z.literal('credential'),
    category: z.enum(CATEGORIES),
    title: z
      .string()
      .trim()
      .min(1, 'Enter a title')
      .max(TITLE_MAX, `Up to ${TITLE_MAX} characters`),
    username: z
      .string()
      .trim()
      .max(USERNAME_MAX, `Up to ${USERNAME_MAX} characters`)
      .optional()
      .transform((v) => (v ? v : undefined)),
    password: z
      .string()
      .max(PASSWORD_MAX, `Up to ${PASSWORD_MAX} characters`)
      .optional()
      .transform((v) => (v ? v : undefined)),
    url: z
      .string()
      .max(URL_MAX, `Up to ${URL_MAX} characters`)
      .optional()
      .transform((v, ctx) => {
        if (!v || !v.trim()) return undefined;
        const n = normalizeUrl(v);
        if (n === null) {
          ctx.addIssue({ code: 'custom', message: 'Use a web address like bank.example.com' });
          return z.NEVER;
        }
        return n;
      }),
    fields: z
      .array(fieldSchema)
      .max(FIELD_MAX, `Up to ${FIELD_MAX} extra fields`)
      .transform((fs) => fs.filter((f) => f.value.length > 0)),
    note: z
      .string()
      .trim()
      .max(NOTE_MAX, `Up to ${NOTE_MAX} characters`)
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((c) => Boolean(c.username || c.password || c.fields.length > 0), {
    path: ['password'],
    message: 'Add a username, a password or a field to keep',
  });

export type CredentialPayload = z.output<typeof credentialPayloadSchema>;
export type CredentialInput = z.input<typeof credentialPayloadSchema>;
export type StoredCredential = StoredItem<CredentialPayload>;

export interface CredentialForm {
  category: Category;
  title: string;
  username: string;
  password: string;
  url: string;
  fields: { label: string; value: string; secret: boolean }[];
  note: string;
}

export function toPayloadInput(f: CredentialForm): CredentialInput {
  return {
    v: 1,
    type: 'credential',
    category: f.category,
    title: f.title,
    username: f.username,
    password: f.password,
    url: f.url,
    // a field with neither label nor value is an untouched starter row
    fields: f.fields.filter((x) => x.label.trim() || x.value),
    note: f.note,
  };
}

export const credentialFormSchema = z
  .object({
    category: z.enum(CATEGORIES),
    title: z.string(),
    username: z.string(),
    password: z.string(),
    url: z.string(),
    fields: z.array(z.object({ label: z.string(), value: z.string(), secret: z.boolean() })),
    note: z.string(),
  })
  .superRefine((f, ctx) => {
    const r = credentialPayloadSchema.safeParse(toPayloadInput(f));
    if (r.success) return;
    for (const issue of r.error.issues) {
      ctx.addIssue({
        code: 'custom',
        message: issue.message,
        path: issue.path as (string | number)[],
      });
    }
  });

export function starterFields(category: Category): CredentialForm['fields'] {
  return category === 'bank'
    ? BANK_STARTER_FIELDS.map((label) => ({ label, value: '', secret: label === 'Account number' }))
    : [];
}

export function toForm(p: CredentialPayload | null, category: Category = 'bank'): CredentialForm {
  if (!p) {
    return {
      category,
      title: '',
      username: '',
      password: '',
      url: '',
      fields: starterFields(category),
      note: '',
    };
  }
  return {
    category: p.category,
    title: p.title,
    username: p.username ?? '',
    password: p.password ?? '',
    url: p.url ?? '',
    fields: p.fields.map((f) => ({ ...f })),
    note: p.note ?? '',
  };
}

export function parsePayload(raw: unknown): CredentialPayload | null {
  const r = credentialPayloadSchema.safeParse(raw);
  return r.success ? r.data : null;
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Title, username and website host only; never a password, a secret field or the note. */
export function matchesSearch(p: CredentialPayload, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  return [p.title, p.username ?? '', hostOf(p.url ?? '')].some((x) => fold(x).includes(q));
}

export interface Section {
  category: Category;
  title: string;
  data: StoredCredential[];
}

/** Bank, Email, Other in that order, each sorted by title; empty sections are left out. */
export function toSections(list: StoredCredential[], query = ''): Section[] {
  return CATEGORIES.map((category) => ({
    category,
    title: CATEGORY_LABEL[category],
    data: list
      .filter((c) => c.payload.category === category && matchesSearch(c.payload, query))
      .sort((a, b) =>
        a.payload.title.localeCompare(b.payload.title, undefined, { sensitivity: 'base' }),
      ),
  })).filter((s) => s.data.length > 0);
}

export function categoryCounts(list: StoredCredential[]): Record<Category, number> {
  const out: Record<Category, number> = { bank: 0, email: 0, other: 0 };
  for (const c of list) out[c.payload.category] += 1;
  return out;
}
