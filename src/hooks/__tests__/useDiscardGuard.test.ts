import { renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { useDiscardGuard } from '../useDiscardGuard';

type Listener = (e: { preventDefault: () => void; data: { action: unknown } }) => void;
const mockListeners: Listener[] = [];
const mockNav = {
  setOptions: jest.fn(),
  dispatch: jest.fn(),
  addListener: jest.fn((_name: string, l: Listener) => {
    mockListeners.push(l);
    return () => mockListeners.splice(mockListeners.indexOf(l), 1);
  }),
};
jest.mock('expo-router', () => ({ useNavigation: () => mockNav }));

beforeEach(() => {
  mockListeners.length = 0;
  jest.clearAllMocks();
});

describe('useDiscardGuard', () => {
  it('lets a clean form go and keeps the edge swipe', async () => {
    await renderHook(() => useDiscardGuard(false));
    expect(mockNav.setOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
    expect(mockListeners).toHaveLength(0);
  });

  it('asks before an edited form leaves, and leaves on Discard', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    await renderHook(() => useDiscardGuard(true));
    expect(mockNav.setOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
    const preventDefault = jest.fn();
    mockListeners[0]?.({ preventDefault, data: { action: 'GO_BACK' } });
    expect(preventDefault).toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(mockNav.dispatch).toHaveBeenCalledWith('GO_BACK');
    alert.mockRestore();
  });

  it('does not question a leave after release (a saved form)', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const { result } = await renderHook(() => useDiscardGuard(true));
    result.current.release();
    const preventDefault = jest.fn();
    mockListeners[0]?.({ preventDefault, data: { action: 'REPLACE' } });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
