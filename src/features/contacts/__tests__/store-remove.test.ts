import type { StoredContact } from '../model';
import { useContacts } from '../store';

const mockDelete = jest.fn();

jest.mock('../api', () => ({
  listContacts: jest.fn(),
  createContact: jest.fn(),
  createContacts: jest.fn(),
  updateContact: jest.fn(),
  deleteContact: (id: string, version: number) => mockDelete(id, version),
}));

const contact = (id: string): StoredContact => ({
  id,
  version: 2,
  payload: {
    v: 1,
    type: 'contact',
    name: `Person ${id}`,
    phones: [{ number: '+919876543210', label: 'mobile' }],
    note: undefined,
    source: 'manual',
  },
});

beforeEach(() => {
  mockDelete.mockReset();
  useContacts.setState({
    status: 'ready',
    items: { a: contact('a'), b: contact('b'), c: contact('c') },
  });
});

describe('contacts removeMany', () => {
  it('deletes each one and keeps the ones that failed', async () => {
    mockDelete.mockImplementation((id: string) =>
      id === 'b' ? Promise.reject(new Error('offline')) : Promise.resolve(),
    );
    const r = await useContacts.getState().removeMany([contact('a'), contact('b'), contact('c')]);
    expect(r).toEqual({ deleted: 2, failed: ['b'] });
    expect(mockDelete).toHaveBeenCalledWith('a', 2);
    expect(Object.keys(useContacts.getState().items)).toEqual(['b']);
  });
});
