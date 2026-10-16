// covers: AC-2 (validation, normalization), AC-3 (call and WhatsApp targets), AC-5 (search),
// AC-1 (tabs, counts, sort), AC-4 (duplicate rule) of spec 0003
import {
  contactFormSchema,
  formatPhone,
  isDuplicate,
  isInternational,
  matchesSearch,
  normalizePhone,
  parsePayload,
  telUrl,
  toForm,
  toPayloadInput,
  vaultNumbers,
  whatsappUrl,
  contactPayloadSchema,
  type ContactPayload,
  visibleContacts,
  type StoredContact,
} from '../model';

const contact = (name: string, numbers: string[]): ContactPayload =>
  contactPayloadSchema.parse({
    v: 1,
    type: 'contact',
    name,
    phones: numbers.map((number) => ({ number, label: 'mobile' })),
    source: 'manual',
  });
const stored = (p: ContactPayload, i: number): StoredContact => ({
  id: `id${i}`,
  version: 1,
  payload: p,
});

describe('normalizePhone', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['098765-43210', '+919876543210'],
    ['(987) 654-3210', '+919876543210'],
    ['+44 20 7946 0958', '+442079460958'],
    ['0044 20 7946 0958', '+442079460958'],
    ['0261 2345678', '02612345678'],
    ['5551234', '5551234'],
    ['', ''],
    ['abc', ''],
  ])('%s → %s', (raw, out) => {
    expect(normalizePhone(raw)).toBe(out);
  });
});

describe('call and WhatsApp targets (AC-3)', () => {
  it('builds tel and wa.me links, and refuses WhatsApp without a country code', () => {
    expect(telUrl('+919876543210')).toBe('tel:+919876543210');
    expect(telUrl('02612345678')).toBe('tel:02612345678');
    expect(whatsappUrl('+919876543210')).toBe('https://wa.me/919876543210');
    expect(whatsappUrl('02612345678')).toBeNull();
    expect(isInternational('+1234567')).toBe(false);
    expect(isInternational('+12345678')).toBe(true);
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhone('+442079460958')).toBe('+442079460958');
  });
});

describe('payload validation (AC-2)', () => {
  it('normalizes numbers, defaults the label and drops an empty note', () => {
    const p = contactPayloadSchema.parse({
      v: 1,
      type: 'contact',
      name: '  Papa ',
      phones: [{ number: '98765 43210', label: ' ' }],
      channels: { call: true, whatsapp: true },
      note: '   ',
      source: 'manual',
    });
    expect(p).toEqual({
      v: 1,
      type: 'contact',
      name: 'Papa',
      phones: [{ number: '+919876543210', label: 'mobile' }],
      channels: { call: true, whatsapp: true },
      note: undefined,
      source: 'manual',
    });
  });

  it('still reads a contact saved with the old Call and WhatsApp tags', () => {
    const legacy = parsePayload({
      v: 1,
      type: 'contact',
      name: 'Old',
      phones: [{ number: '+919811111111', label: 'mobile' }],
      channels: { call: false, whatsapp: true },
      source: 'manual',
    });
    expect(legacy?.name).toBe('Old');
  });

  it('maps form errors onto the fields the person typed in', () => {
    const r = contactFormSchema.safeParse({
      name: '',
      phones: [{ number: 'x', label: 'mobile' }],
      note: 'n'.repeat(501),
    });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['name', 'note']));
    // the error lands on the number box the person typed in
    expect(paths).toEqual(expect.arrayContaining(['phones.0.number']));
  });

  it('refuses more than five numbers and a too long name', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ number: `98765432${10 + i}`, label: '' }));
    const r = contactFormSchema.safeParse({
      name: 'n'.repeat(81),
      phones: many,
      note: '',
    });
    expect(r.success).toBe(false);
  });

  it('round trips through the form shape', () => {
    const p = contact('Mummy', ['+919811111111']);
    const back = contactPayloadSchema.parse(toPayloadInput(toForm(p), 'manual'));
    expect(back).toEqual(p);
    expect(toForm(null).phones).toHaveLength(1);
  });

  it('parsePayload refuses notes and other shapes', () => {
    expect(parsePayload({ v: 1, type: 'note', title: 'x', body: 'y' })).toBeNull();
    expect(parsePayload(contact('A', ['+919811111111']))).not.toBeNull();
  });
});

describe('search, the list and duplicates (AC-1, AC-4, AC-5)', () => {
  const book = [
    contact('Ëkansh', ['+919811111111']),
    contact('bhai', ['+919822222222']),
    contact('Aai', ['02612345678']),
  ].map(stored);

  it('searches names without case or accents and numbers by 3 or more digits', () => {
    expect(matchesSearch(book[0]!.payload, 'ekan')).toBe(true);
    expect(matchesSearch(book[0]!.payload, '1111')).toBe(true);
    expect(matchesSearch(book[0]!.payload, '11')).toBe(false);
    expect(matchesSearch(book[1]!.payload, '')).toBe(true);
  });

  it('lists every contact sorted by name, filtered by the search', () => {
    expect(visibleContacts(book).map((c) => c.payload.name)).toEqual(['Aai', 'bhai', 'Ëkansh']);
    expect(visibleContacts(book, 'bh').map((c) => c.payload.name)).toEqual(['bhai']);
  });

  it('marks a candidate duplicate only when every number is already in the vault', () => {
    const known = vaultNumbers(book);
    expect(isDuplicate(['98111 11111'], known)).toBe(true);
    expect(isDuplicate(['98111 11111', '9833333333'], known)).toBe(false);
    expect(isDuplicate([], known)).toBe(false);
  });
});
