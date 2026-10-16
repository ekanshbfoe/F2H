import { z } from 'zod';

/**
 * Contacts vault model (spec 0003). Pure functions only: no crypto, no network, so every rule
 * here is cheap to test and reused by the form, the list, search and the import.
 */

/** The family lives in India: a bare 10 digit mobile number gets this calling code. */
export const DEFAULT_CALLING_CODE = '91';
export const MAX_PHONES = 5;
export const NAME_MAX = 80;
export const NOTE_MAX = 500;
export const LABEL_MAX = 24;

/**
 * Keeps digits and a leading `+`. `00` becomes `+`; a bare 10 digit number starting 6 to 9, or
 * `0` plus 10 digits, gets `+91`; anything else is kept as typed digits.
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (plus) return `+${digits}`;
  if (digits.startsWith('00') && digits.length > 4) return `+${digits.slice(2)}`;
  const mobile = digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  if (mobile.length === 10 && /^[6-9]/.test(mobile)) return `+${DEFAULT_CALLING_CODE}${mobile}`;
  return digits;
}

export function phoneDigits(n: string): string {
  return n.replace(/\D/g, '');
}

/** A number WhatsApp can open: starts with `+` and has 8 to 15 digits (E.164). */
export function isInternational(n: string): boolean {
  const d = phoneDigits(n);
  return n.startsWith('+') && d.length >= 8 && d.length <= 15;
}

export function telUrl(n: string): string {
  return `tel:${n.startsWith('+') ? '+' : ''}${phoneDigits(n)}`;
}

/** `https://wa.me/<digits>` for an international number, else null. */
export function whatsappUrl(n: string): string | null {
  return isInternational(n) ? `https://wa.me/${phoneDigits(n)}` : null;
}

/** "+91 98765 43210" style display for Indian numbers; other numbers are shown as stored. */
export function formatPhone(n: string): string {
  const d = phoneDigits(n);
  if (n.startsWith('+91') && d.length === 12) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return n;
}

const phoneSchema = z.object({
  number: z
    .string()
    .transform(normalizePhone)
    .refine((v) => phoneDigits(v).length >= 3, 'Enter a phone number')
    .refine((v) => phoneDigits(v).length <= 15, 'That number is too long'),
  label: z
    .string()
    .trim()
    .max(LABEL_MAX, `Keep the label under ${LABEL_MAX} characters`)
    .transform((v) => v || 'mobile'),
});

export const contactPayloadSchema = z.object({
  v: z.literal(1),
  type: z.literal('contact'),
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name')
    .max(NAME_MAX, `Keep the name under ${NAME_MAX} characters`),
  phones: z
    .array(phoneSchema)
    .min(1, 'Add at least one number')
    .max(MAX_PHONES, `Up to ${MAX_PHONES} numbers`),
  /**
   * Legacy: contacts saved before the WhatsApp list was dropped carry Call and WhatsApp tags.
   * Still read so those contacts open; new contacts are saved without it.
   */
  channels: z.object({ call: z.boolean(), whatsapp: z.boolean() }).optional(),
  note: z
    .string()
    .trim()
    .max(NOTE_MAX, `Keep the note under ${NOTE_MAX} characters`)
    .optional()
    .transform((v) => (v ? v : undefined)),
  source: z.enum(['manual', 'device']),
});

export type ContactPayload = z.output<typeof contactPayloadSchema>;
export type ContactInput = z.input<typeof contactPayloadSchema>;

/** The form's shape: what the person types, before normalization. */
export const contactFormSchema = z
  .object({
    name: z.string(),
    phones: z.array(z.object({ number: z.string(), label: z.string() })),
    note: z.string(),
  })
  .superRefine((f, ctx) => {
    const r = contactPayloadSchema.safeParse(toPayloadInput(f, 'manual'));
    if (r.success) return;
    for (const issue of r.error.issues) {
      const [head, index, field] = issue.path;
      const path =
        head === 'phones' && index !== undefined
          ? ['phones', index, field ?? 'number']
          : [head ?? 'name'];
      ctx.addIssue({ code: 'custom', message: issue.message, path: path as (string | number)[] });
    }
  });
export type ContactForm = z.infer<typeof contactFormSchema>;

export function toPayloadInput(f: ContactForm, source: 'manual' | 'device'): ContactInput {
  return {
    v: 1,
    type: 'contact',
    name: f.name,
    phones: f.phones.filter((p) => p.number.trim().length > 0),
    note: f.note,
    source,
  };
}

export function toForm(p: ContactPayload | null): ContactForm {
  if (!p)
    return {
      name: '',
      phones: [{ number: '', label: 'mobile' }],
      note: '',
    };
  return {
    name: p.name,
    phones: p.phones.map((x) => ({ number: x.number, label: x.label })),
    note: p.note ?? '',
  };
}

/** Parses a decrypted payload; null for anything that is not a v1 contact. */
export function parsePayload(raw: unknown): ContactPayload | null {
  const r = contactPayloadSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Lower case, accents removed, for case and accent insensitive name search. */
export function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function matchesSearch(p: ContactPayload, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (foldName(p.name).includes(foldName(q))) return true;
  const qd = phoneDigits(q);
  return qd.length >= 3 && p.phones.some((x) => phoneDigits(x.number).includes(qd));
}

export interface StoredContact {
  id: string;
  version: number;
  payload: ContactPayload;
}

export function sortContacts<T extends { payload: ContactPayload }>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    a.payload.name.localeCompare(b.payload.name, undefined, { sensitivity: 'base' }),
  );
}

/** The one contacts list: every contact matching the search, sorted by name. */
export function visibleContacts(list: StoredContact[], query = ''): StoredContact[] {
  return sortContacts(list.filter((c) => matchesSearch(c.payload, query)));
}

/** Every normalized number of the vault, for the import duplicate check. */
export function vaultNumbers(list: StoredContact[]): Set<string> {
  const out = new Set<string>();
  for (const c of list) for (const p of c.payload.phones) out.add(phoneDigits(p.number));
  return out;
}

/** A candidate is a duplicate when every one of its normalized numbers is already in the vault. */
export function isDuplicate(numbers: string[], known: Set<string>): boolean {
  const ds = numbers.map((n) => phoneDigits(normalizePhone(n))).filter((d) => d.length > 0);
  return ds.length > 0 && ds.every((d) => known.has(d));
}
