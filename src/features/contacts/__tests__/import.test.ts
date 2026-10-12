// covers: AC-4 of spec 0003 (mapping, skip, merge, duplicate mark, paging, permission, cap)
import { Contact, requestPermissionsAsync } from 'expo-contacts';

import {
  IMPORT_CAP,
  ImportError,
  PAGE_SIZE,
  readDeviceContacts,
  toCandidates,
  toPayload,
} from '../import';

jest.mock('expo-contacts', () => ({
  Contact: { getAllDetails: jest.fn() },
  ContactField: { FULL_NAME: 'fullName', PHONES: 'phones' },
  ContactsSortOrder: { GivenName: 'givenName' },
  requestPermissionsAsync: jest.fn(),
}));

const getAll = Contact.getAllDetails as jest.Mock;
const request = requestPermissionsAsync as jest.Mock;

beforeEach(() => {
  getAll.mockReset();
  request.mockReset();
});

describe('toCandidates', () => {
  it('skips entries without a number, merges repeats and marks vault duplicates', () => {
    const known = new Set(['919811111111']);
    const out = toCandidates(
      [
        { fullName: 'Papa', phones: [{ number: '98111 11111', label: 'Mobile' }] },
        { fullName: 'No number', phones: [] },
        { fullName: 'Bhai', phones: [{ number: '98222 22222' }, { number: '+91 98222 22222' }] },
        { fullName: 'Bhai copy', phones: [{ number: '9822222222' }] },
        { fullName: '', phones: [{ number: '+44 20 7946 0958', label: 'work' }] },
        { fullName: 'Junk', phones: [{ number: '12' }] },
      ],
      known,
    );
    expect(out.map((c) => [c.name, c.duplicate])).toEqual([
      ['+442079460958', false],
      ['Bhai', false],
      ['Papa', true],
    ]);
    expect(out.find((c) => c.name === 'Bhai')?.phones).toEqual([
      { number: '+919822222222', label: 'mobile' },
    ]);
    expect(out.find((c) => c.name === 'Papa')?.phones[0]?.label).toBe('mobile');
  });

  it('keeps at most five numbers and builds a valid device payload', () => {
    const phones = Array.from({ length: 7 }, (_, i) => ({ number: `98765432${10 + i}` }));
    const [c] = toCandidates([{ fullName: 'Many', phones }], new Set());
    expect(c?.phones).toHaveLength(5);
    const p = toPayload(c!, { call: false, whatsapp: true });
    expect(p.source).toBe('device');
    expect(p.channels).toEqual({ call: false, whatsapp: true });
  });
});

describe('readDeviceContacts', () => {
  it('throws permission_denied and passes on whether Android may ask again', async () => {
    request.mockResolvedValue({ granted: false, canAskAgain: false });
    await expect(readDeviceContacts()).rejects.toMatchObject({
      code: 'permission_denied',
      canAskAgain: false,
    });
    expect(getAll).not.toHaveBeenCalled();
  });

  it('reads pages until a short page', async () => {
    request.mockResolvedValue({ granted: true, canAskAgain: true });
    const page = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `x${i}`, fullName: `C${i}`, phones: [] }));
    getAll.mockResolvedValueOnce(page(PAGE_SIZE)).mockResolvedValueOnce(page(3));
    const r = await readDeviceContacts();
    expect(r.entries).toHaveLength(PAGE_SIZE + 3);
    expect(r.capped).toBe(false);
    expect(getAll.mock.calls.map((c) => c[1].offset)).toEqual([0, PAGE_SIZE]);
    // the phone's own ids never make it into the entries
    expect(Object.keys(r.entries[0]!)).toEqual(['fullName', 'phones']);
  });

  it('stops at the cap', async () => {
    request.mockResolvedValue({ granted: true, canAskAgain: true });
    getAll.mockImplementation(async () =>
      Array.from({ length: PAGE_SIZE }, () => ({ fullName: 'C', phones: [] })),
    );
    const r = await readDeviceContacts();
    expect(r.capped).toBe(true);
    expect(r.entries).toHaveLength(IMPORT_CAP);
  });

  it('wraps a native failure as read_failed', async () => {
    request.mockResolvedValue({ granted: true, canAskAgain: true });
    getAll.mockRejectedValue(new Error('boom'));
    await expect(readDeviceContacts()).rejects.toBeInstanceOf(ImportError);
  });
});
