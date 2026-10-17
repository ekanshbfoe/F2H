// Save to phone: vault contacts written into the phone's address book, never as doubles.
import { numberKey, planExport, saveToPhone } from '../export';
import type { StoredContact } from '../model';

const mockCreate = jest.fn();
const mockPerm = jest.fn();
let mockOnPhone: { phones: { number: string }[] }[] = [];

jest.mock('expo-contacts', () => ({
  ContactField: { PHONES: 'phones', FULL_NAME: 'fullName' },
  ContactsSortOrder: { GivenName: 'givenName' },
  requestPermissionsAsync: () => mockPerm(),
  Contact: {
    getAllDetails: async () => mockOnPhone,
    create: (c: unknown) => mockCreate(c),
  },
}));

const contact = (id: string, ...numbers: string[]): StoredContact => ({
  id,
  version: 1,
  payload: {
    v: 1,
    type: 'contact',
    name: `Person ${id}`,
    phones: numbers.map((number) => ({ number, label: 'mobile' })),
    note: undefined,
    source: 'manual',
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPerm.mockResolvedValue({ granted: true, canAskAgain: true });
  mockCreate.mockResolvedValue({});
  mockOnPhone = [];
});

describe('planExport', () => {
  it('matches a number however it is written', () => {
    expect(numberKey('+91 98765 43210')).toBe(numberKey('098765-43210'));
  });

  it('skips contacts the phone has, and repeats within the pick', () => {
    const known = new Set([numberKey('+919876543210')]);
    const { add, skipped } = planExport(
      [contact('a', '+919876543210'), contact('b', '+918888888888'), contact('c', '08888888888')],
      known,
    );
    expect(add.map((c) => c.id)).toEqual(['b']);
    expect(skipped).toBe(2);
  });
});

describe('saveToPhone', () => {
  it('writes the new ones with their numbers and reports the counts', async () => {
    mockOnPhone = [{ phones: [{ number: '+91 98765 43210' }] }];
    const r = await saveToPhone([contact('a', '+919876543210'), contact('b', '+918888888888')]);
    expect(r).toEqual({ added: 1, skipped: 1, failed: 0 });
    expect(mockCreate).toHaveBeenCalledWith({
      givenName: 'Person b',
      phones: [{ number: '+918888888888', label: 'mobile' }],
    });
  });

  it('stops before writing anything when permission is refused', async () => {
    mockPerm.mockResolvedValue({ granted: false, canAskAgain: false });
    await expect(saveToPhone([contact('a', '+918888888888')])).rejects.toMatchObject({
      code: 'permission_denied',
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
