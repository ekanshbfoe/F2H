// covers: AC-1 (sections, search), AC-2 (validation, url, starter fields), AC-3 (generator) of spec 0004
import {
  DEFAULT_OPTIONS,
  generatePassword,
  MAX_LENGTH,
  MIN_LENGTH,
  randomIndex,
  SETS,
  strengthBits,
  strengthLabel,
} from '../generator';
import {
  categoryCounts,
  credentialFormSchema,
  credentialPayloadSchema,
  hostOf,
  matchesSearch,
  normalizeUrl,
  parsePayload,
  toForm,
  toPayloadInput,
  toSections,
  type CredentialPayload,
  type StoredCredential,
} from '../model';

const make = (
  title: string,
  category: 'bank' | 'email' | 'other',
  extra: Partial<CredentialPayload> = {},
) =>
  credentialPayloadSchema.parse({
    v: 1,
    type: 'credential',
    category,
    title,
    username: 'user',
    password: 'p4ss',
    fields: [],
    ...extra,
  });
const stored = (p: CredentialPayload, i: number): StoredCredential => ({
  id: `c${i}`,
  version: 1,
  payload: p,
});

describe('urls', () => {
  it.each([
    ['netbanking.example.in', 'https://netbanking.example.in'],
    ['http://mail.example.com/login', 'http://mail.example.com/login'],
    ['  ', ''],
    ['javascript:alert(1)', null],
    ['ftp://files.example.com', null],
    ['nodot', null],
  ])('normalizeUrl(%s)', (raw, out) => {
    expect(normalizeUrl(raw)).toBe(out);
  });

  it('extracts the host only', () => {
    expect(hostOf('https://Mail.Example.com/u/0?token=abc')).toBe('mail.example.com');
    expect(hostOf('not a url')).toBe('');
  });
});

describe('payload and form (AC-2)', () => {
  it('needs something to keep and a title', () => {
    const r = credentialFormSchema.safeParse({ ...toForm(null, 'other'), title: '' });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['title', 'password']));
  });

  it('refuses a non web address and keeps the password untrimmed', () => {
    const bad = credentialFormSchema.safeParse({
      ...toForm(null, 'email'),
      title: 'Mail',
      password: 'x',
      url: 'javascript:x',
    });
    expect(bad.success).toBe(false);
    const p = credentialPayloadSchema.parse(
      toPayloadInput({ ...toForm(null, 'email'), title: 'Mail', password: '  spaced  ' }),
    );
    expect(p.password).toBe('  spaced  ');
  });

  it('starts a bank item with two starter fields and drops them when left empty', () => {
    const f = toForm(null, 'bank');
    expect(f.fields.map((x) => x.label)).toEqual(['Customer ID', 'Account number']);
    const p = credentialPayloadSchema.parse(toPayloadInput({ ...f, title: 'SBI', username: 'me' }));
    expect(p.fields).toEqual([]);
    const withAcct = credentialPayloadSchema.parse(
      toPayloadInput({
        ...f,
        title: 'SBI',
        fields: [{ label: 'Account number', value: '1234', secret: true }],
      }),
    );
    expect(withAcct.fields).toEqual([{ label: 'Account number', value: '1234', secret: true }]);
  });

  it('round trips through the form and refuses other shapes', () => {
    const p = make('Gmail', 'email', {
      url: 'https://mail.google.com',
      note: 'recovery phone is Papa',
    });
    expect(credentialPayloadSchema.parse(toPayloadInput(toForm(p)))).toEqual(p);
    expect(parsePayload({ v: 1, type: 'contact' })).toBeNull();
  });
});

describe('sections and search (AC-1)', () => {
  const list = [
    make('SBI', 'bank'),
    make('Axis', 'bank', { username: 'axis-user' }),
    make('Gmail', 'email', { url: 'https://mail.google.com', password: 'findme' }),
    make('Wifi', 'other', { fields: [{ label: 'Key', value: 'hunter2', secret: true }] }),
  ].map(stored);

  it('groups Bank, Email, Other and sorts by title', () => {
    expect(toSections(list).map((s) => [s.title, s.data.map((d) => d.payload.title)])).toEqual([
      ['Bank', ['Axis', 'SBI']],
      ['Email', ['Gmail']],
      ['Other', ['Wifi']],
    ]);
    expect(categoryCounts(list)).toEqual({ bank: 2, email: 1, other: 1 });
  });

  it('searches title, username and host but never secrets', () => {
    expect(matchesSearch(list[1]!.payload, 'axis-us')).toBe(true);
    expect(matchesSearch(list[2]!.payload, 'google')).toBe(true);
    expect(matchesSearch(list[2]!.payload, 'findme')).toBe(false);
    expect(matchesSearch(list[3]!.payload, 'hunter')).toBe(false);
    expect(toSections(list, 'zzz')).toEqual([]);
  });
});

describe('generator (AC-3)', () => {
  it('has the requested length and one of every enabled set, 500 times', () => {
    for (let i = 0; i < 500; i += 1) {
      const pw = generatePassword(DEFAULT_OPTIONS);
      expect(pw).toHaveLength(20);
      for (const s of Object.values(SETS)) expect([...pw].some((c) => s.includes(c))).toBe(true);
    }
  });

  it('uses only the enabled sets and clamps the length', () => {
    const only = generatePassword({
      length: 99,
      sets: { lower: false, upper: false, digits: false, symbols: true },
    });
    expect(only).toHaveLength(MAX_LENGTH);
    expect([...only].every((c) => SETS.symbols.includes(c))).toBe(true);
    expect(generatePassword({ ...DEFAULT_OPTIONS, length: 1 })).toHaveLength(MIN_LENGTH);
    expect(() =>
      generatePassword({
        length: 20,
        sets: { lower: false, upper: false, digits: false, symbols: false },
      }),
    ).toThrow();
  });

  it('rejects the biased tail of a byte instead of folding it with modulo', () => {
    // 256 % 10 = 6, so bytes 250..255 must be redrawn for a range of 10
    const bytes = [255, 252, 250, 7];
    const source = () => new Uint8Array([bytes.shift() ?? 0]);
    expect(randomIndex(10, source)).toBe(7);
    expect(bytes).toHaveLength(0);
  });

  it('spreads digits evenly enough', () => {
    const counts = new Array(10).fill(0) as number[];
    for (let i = 0; i < 5000; i += 1) counts[randomIndex(10)]! += 1;
    for (const c of counts) expect(c).toBeGreaterThan(380);
  });

  it('reports strength in bits', () => {
    expect(strengthBits(DEFAULT_OPTIONS)).toBe(Math.floor(20 * Math.log2(76)));
    expect(strengthLabel(124)).toBe('Very strong');
    expect(strengthLabel(50)).toBe('Weak');
  });
});
