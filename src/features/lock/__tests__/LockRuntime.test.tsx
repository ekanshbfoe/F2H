// covers: AC-2 (the gate covers the app while locked) and the success hold after the right PIN
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/lib/test-utils';

import { LockRuntime } from '../LockRuntime';
import { useLock } from '../lock.store';

let mockMounts = 0;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useNavigation: () => ({
    setOptions: jest.fn(),
    addListener: jest.fn(() => () => undefined),
    dispatch: jest.fn(),
  }),
  router: { replace: jest.fn() },
}));
jest.mock('../hooks', () => ({
  useAutoLock: () => undefined,
  useRevokeGuard: () => undefined,
  useScreenCaptureBlock: () => undefined,
  useAppStateStatus: () => 'active',
}));
jest.mock('../screens/UnlockScreen', () => {
  const { useEffect } = jest.requireActual('react');
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    UnlockScreen: ({ onOpened }: { onOpened?: () => void }) => {
      useEffect(() => {
        mockMounts += 1;
      }, []);
      return (
        <Pressable accessibilityRole="button" onPress={onOpened}>
          <Text>gate</Text>
        </Pressable>
      );
    },
  };
});

beforeEach(() => {
  mockMounts = 0;
  useLock.setState({ state: 'locked', generation: 1, busy: false });
});

describe('LockRuntime', () => {
  it('keeps the gate up after the right PIN until its sequence reports done', async () => {
    await renderWithProviders(<LockRuntime />);
    expect(screen.getByText('gate')).toBeOnTheScreen();
    await act(async () => useLock.setState({ state: 'unlocked' }));
    expect(screen.getByText('gate')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button'));
    expect(screen.queryByText('gate')).toBeNull();
  });

  it('mockMounts a fresh gate when the phone locks again during the hold', async () => {
    await renderWithProviders(<LockRuntime />);
    await act(async () => useLock.setState({ state: 'unlocked' }));
    expect(mockMounts).toBe(1);
    await act(async () => useLock.setState({ state: 'locked', generation: 2 }));
    expect(screen.getByText('gate')).toBeOnTheScreen();
    expect(mockMounts).toBe(2);
  });

  it('never traps the app behind the gate if the sequence never reports', async () => {
    jest.useFakeTimers();
    try {
      await renderWithProviders(<LockRuntime />);
      await act(async () => useLock.setState({ state: 'unlocked' }));
      await act(async () => {
        jest.advanceTimersByTime(1600);
      });
      expect(screen.queryByText('gate')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
