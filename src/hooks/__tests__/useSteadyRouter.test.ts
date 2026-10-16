import { renderHook } from '@testing-library/react-native';

import { PUSH_GAP_MS, useSteadyRouter } from '../useSteadyRouter';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

describe('useSteadyRouter', () => {
  it('opens a screen once for a double tap, and again after a pause', async () => {
    const now = jest.spyOn(Date, 'now');
    const { result } = await renderHook(() => useSteadyRouter());
    now.mockReturnValue(10_000);
    result.current.push('/a' as never);
    now.mockReturnValue(10_000 + PUSH_GAP_MS - 1);
    result.current.push('/a' as never);
    expect(mockPush).toHaveBeenCalledTimes(1);
    now.mockReturnValue(10_000 + PUSH_GAP_MS + 1);
    result.current.push('/b' as never);
    expect(mockPush).toHaveBeenLastCalledWith('/b');
    now.mockRestore();
  });
});
