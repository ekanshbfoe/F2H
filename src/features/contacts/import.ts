import { Contact, ContactField, ContactsSortOrder, requestPermissionsAsync } from 'expo-contacts';

import {
  contactPayloadSchema,
  isDuplicate,
  LABEL_MAX,
  MAX_PHONES,
  NAME_MAX,
  normalizePhone,
  phoneDigits,
  type ContactPayload,
} from './model';

/**
 * Import from the phone's address book (spec 0003, AC-4). Reading is paged so a large book never
 * sits in memory twice; the mapping is a pure function so it is tested without the native module.
 * The phone's own contact ids are never kept.
 */

export const PAGE_SIZE = 200;
export const IMPORT_CAP = 2000;

export interface DeviceEntry {
  fullName?: string | null;
  phones?: { number?: string | null; label?: string | null }[] | null;
}

export interface Candidate {
  key: string;
  name: string;
  phones: { number: string; label: string }[];
  duplicate: boolean;
}

export class ImportError extends Error {
  constructor(
    readonly code: 'permission_denied' | 'read_failed',
    readonly canAskAgain = true,
  ) {
    super(code);
    this.name = 'ImportError';
  }
}

/** Raw entries → review candidates: no number skipped, same numbers merged, vault duplicates marked. */
export function toCandidates(entries: DeviceEntry[], known: Set<string>): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const e of entries) {
    const phones: { number: string; label: string }[] = [];
    const digitsSeen = new Set<string>();
    for (const p of e.phones ?? []) {
      const number = normalizePhone(p.number ?? '');
      const d = phoneDigits(number);
      if (d.length < 3 || d.length > 15 || digitsSeen.has(d)) continue;
      digitsSeen.add(d);
      phones.push({
        number,
        label: (p.label ?? '').trim().toLowerCase().slice(0, LABEL_MAX) || 'mobile',
      });
      if (phones.length === MAX_PHONES) break;
    }
    if (phones.length === 0) continue;
    const key = [...digitsSeen].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const name = (e.fullName ?? '').trim().slice(0, NAME_MAX) || phones[0]!.number;
    out.push({
      key,
      name,
      phones,
      duplicate: isDuplicate(
        phones.map((p) => p.number),
        known,
      ),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function toPayload(
  c: Candidate,
  channels: { call: boolean; whatsapp: boolean },
): ContactPayload {
  return contactPayloadSchema.parse({
    v: 1,
    type: 'contact',
    name: c.name,
    phones: c.phones,
    channels,
    source: 'device',
  });
}

/** Asks for the permission, then reads names and numbers in pages of 200 up to the cap. */
export async function readDeviceContacts(): Promise<{ entries: DeviceEntry[]; capped: boolean }> {
  const perm = await requestPermissionsAsync();
  if (!perm.granted) throw new ImportError('permission_denied', perm.canAskAgain);
  const entries: DeviceEntry[] = [];
  try {
    for (let offset = 0; offset < IMPORT_CAP; offset += PAGE_SIZE) {
      const page = (await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES], {
        limit: PAGE_SIZE,
        offset,
        sortOrder: ContactsSortOrder.GivenName,
      })) as DeviceEntry[];
      for (const p of page) entries.push({ fullName: p.fullName ?? null, phones: p.phones ?? [] });
      if (page.length < PAGE_SIZE) return { entries, capped: false };
    }
  } catch {
    throw new ImportError('read_failed');
  }
  return { entries, capped: true };
}
