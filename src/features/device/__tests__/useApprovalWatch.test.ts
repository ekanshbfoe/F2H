// covers: AC-7 (instant over Realtime, 10 s poll fallback, clean unsubscribe)
import { act, renderHook } from '@testing-library/react-native';
import { useApprovalWatch } from '../useApprovalWatch';

const mockMaybeSingle = jest.fn();
const mockRemoveChannel = jest.fn(async (_channel: unknown) => 'ok');
let mockHandler: ((payload: { new: unknown }) => void) | null = null;
type Channel = { on: jest.Mock; subscribe: jest.Mock };
const mockChannel: Channel = {
  on: jest.fn((_e: string, _f: unknown, cb: (payload: { new: unknown }) => void) => {
    mockHandler = cb;
    return mockChannel;
  }),
  subscribe: jest.fn(() => mockChannel),
};

jest.mock('@/services/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => mockMaybeSingle() }) }),
    }),
    channel: () => mockChannel,
    removeChannel: (c: unknown) => mockRemoveChannel(c),
  },
}));

const pending = { id: 'dev-1', status: 'pending', model: 'Pixel', os: 'Android' };

/** Settles the mocked fetch chain (two awaits deep) under fake timers. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });

beforeEach(() => {
  jest.useFakeTimers();
  mockMaybeSingle.mockReset();
  mockMaybeSingle.mockResolvedValue({ data: pending, error: null });
  mockHandler = null;
  mockChannel.on.mockClear();
  mockRemoveChannel.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useApprovalWatch', () => {
  it('fetches once, subscribes to its own row, and polls every 10 seconds', async () => {
    const { result, unmount } = await renderHook(() => useApprovalWatch('dev-1'));
    await flush();
    expect(result.current.device).toMatchObject({ status: 'pending' });
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
    expect(mockChannel.on.mock.calls[0]?.[1]).toMatchObject({
      table: 'devices',
      filter: 'id=eq.dev-1',
    });

    mockMaybeSingle.mockResolvedValue({ data: { ...pending, status: 'approved' }, error: null });
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await flush();
    expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
    expect(result.current.device?.status).toBe('approved');
    await unmount();
  });

  it('applies a realtime update without waiting for the poll', async () => {
    const { result, unmount } = await renderHook(() => useApprovalWatch('dev-1'));
    await flush();
    expect(result.current.device?.status).toBe('pending');
    await act(async () => {
      mockHandler?.({ new: { ...pending, status: 'rejected' } });
    });
    expect(result.current.device?.status).toBe('rejected');
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('does nothing without a device id', async () => {
    const { result, unmount } = await renderHook(() => useApprovalWatch(null));
    await flush();
    expect(result.current.device).toBeNull();
    expect(mockChannel.on).not.toHaveBeenCalled();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
    await unmount();
  });

  it('removes the channel and stops polling on unmount', async () => {
    const { unmount } = await renderHook(() => useApprovalWatch('dev-1'));
    await flush();
    await unmount();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
  });

  it('surfaces a fetch error but keeps polling', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    const { result, unmount } = await renderHook(() => useApprovalWatch('dev-1'));
    await flush();
    expect(result.current.error).toBe('offline');
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await flush();
    expect(result.current.device?.status).toBe('pending');
    await unmount();
  });
});
