import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';

import { ImportError, IMPORT_CAP, PAGE_SIZE } from './import';
import { phoneDigits, type StoredContact } from './model';

/**
 * Save to phone: vault contacts written back into the phone's own address book (the dialer's
 * contacts), for a new phone or one that lost its book. A contact whose number the phone already
 * has is skipped, so saving twice never makes doubles. Writing is plaintext by nature: the
 * address book is the phone's, outside the vault.
 */

/** The last 10 digits: "+91 98765 43210" and "098765 43210" are the same number. */
export function numberKey(n: string): string {
  return phoneDigits(n).slice(-10);
}

/** Pure part: which contacts to add, given the numbers the phone already has. */
export function planExport(
  contacts: StoredContact[],
  known: Set<string>,
): { add: StoredContact[]; skipped: number } {
  const add: StoredContact[] = [];
  let skipped = 0;
  const seen = new Set(known);
  for (const c of contacts) {
    const keys = c.payload.phones.map((p) => numberKey(p.number)).filter((k) => k.length >= 3);
    if (keys.length === 0 || keys.some((k) => seen.has(k))) {
      skipped += 1;
      continue;
    }
    keys.forEach((k) => seen.add(k));
    add.push(c);
  }
  return { add, skipped };
}

async function phoneNumbersOnPhone(): Promise<Set<string>> {
  const known = new Set<string>();
  for (let offset = 0; offset < IMPORT_CAP; offset += PAGE_SIZE) {
    const page = (await Contact.getAllDetails([ContactField.PHONES], {
      limit: PAGE_SIZE,
      offset,
    })) as { phones?: { number?: string | null }[] | null }[];
    for (const p of page) {
      for (const ph of p.phones ?? []) if (ph.number) known.add(numberKey(ph.number));
    }
    if (page.length < PAGE_SIZE) break;
  }
  return known;
}

/** Asks for the permission, skips numbers the phone has, writes the rest one by one. */
export async function saveToPhone(
  contacts: StoredContact[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ added: number; skipped: number; failed: number }> {
  const perm = await requestPermissionsAsync();
  if (!perm.granted) throw new ImportError('permission_denied', perm.canAskAgain);
  let known: Set<string>;
  try {
    known = await phoneNumbersOnPhone();
  } catch {
    throw new ImportError('read_failed');
  }
  const { add, skipped } = planExport(contacts, known);
  let added = 0;
  let failed = 0;
  for (const [i, c] of add.entries()) {
    try {
      await Contact.create({
        givenName: c.payload.name,
        phones: c.payload.phones.map((p) => ({ number: p.number, label: p.label })),
        ...(c.payload.note ? { note: c.payload.note } : {}),
      });
      added += 1;
    } catch {
      failed += 1;
    }
    onProgress?.(i + 1, add.length);
  }
  return { added, skipped, failed };
}
