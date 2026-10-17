// Registration stores the push address once; this keeps it current on every app run.
import { syncPushToken } from '../push-sync';

const mockToken = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn(async () => ({ error: null }));

jest.mock('@/services/push', () => ({ getPushToken: () => mockToken() }));
jest.mock('@/services/supabase', () => ({
  supabase: {
    from: () => ({
      update: (row: unknown) => {
        mockUpdate(row);
        return { eq: mockEq };
      },
    }),
  },
}));

beforeEach(() => jest.clearAllMocks());

describe('syncPushToken', () => {
  it('saves the current address on this phone row', async () => {
    mockToken.mockResolvedValue('ExpoPushToken[new]');
    await syncPushToken('d1');
    expect(mockUpdate).toHaveBeenCalledWith({ push_token: 'ExpoPushToken[new]' });
    expect(mockEq).toHaveBeenCalledWith('id', 'd1');
  });

  it('leaves the row alone when there is no address (Expo Go, refused)', async () => {
    mockToken.mockResolvedValue(null);
    await syncPushToken('d1');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
