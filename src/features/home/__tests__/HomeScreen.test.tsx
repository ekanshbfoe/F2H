// covers: spec 0007 AC-4 (vault summary on home), plus the tab layout: Vault first, Family for the
// Admin only, Settings, and Lock now on the round button
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import { renderWithProviders } from '@/lib/test-utils';
import { useSession } from '@/state/session.store';

import { useLock } from '@/features/lock/lock.store';

import { HomeScreen } from '../screens/HomeScreen';

const mockPush = jest.fn();
const mockLockNow = jest.fn();
const mockPending = jest.fn(async (): Promise<unknown[]> => []);

jest.mock('expo-router', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
    addListener: jest.fn(() => () => undefined),
    dispatch: jest.fn(),
  }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/features/admin/api', () => ({
  listPendingDevices: () => mockPending(),
  subscribePendingDevices: () => () => undefined,
}));
jest.mock('@/features/lock/api', () => ({ lockNow: () => mockLockNow() }));
jest.mock('@/features/lock/storage', () => ({
  readTimeoutMs: jest.fn(async () => 60_000),
  writeTimeoutMs: jest.fn(async () => undefined),
}));
jest.mock('@/services/supabase', () => ({ supabase: {}, setForbiddenHandler: jest.fn() }));
jest.mock('@/features/auth/api', () => ({ signOut: jest.fn(async () => undefined) }));

function signIn(role: 'admin' | 'member') {
  useSession.setState({
    profile: { id: 'u1', display_name: 'Asha', role } as never,
  });
}

async function activate(name: RegExp | string) {
  await fireEvent(screen.getByRole('tab', { name }), 'accessibilityAction', {
    nativeEvent: { actionName: 'activate' },
  });
}

beforeEach(() => {
  mockPush.mockClear();
  mockLockNow.mockClear();
  mockPending.mockReset();
  mockPending.mockResolvedValue([]);
  useLock.setState({ state: 'unlocked' });
});

describe('HomeScreen', () => {
  it('opens on the vault with a tile per category', async () => {
    signIn('member');
    await renderWithProviders(<HomeScreen />);
    expect(screen.getByLabelText('F2H family vault')).toBeOnTheScreen();
    expect(screen.queryByText(/Hi Asha/)).toBeNull();
    expect(screen.getByRole('tab', { name: 'Vault' })).toBeSelected();
    await fireEvent.press(screen.getByTestId('home-credentials'));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('credentials'));
  });

  it('shows the Family page to the Admin only, with the waiting count', async () => {
    signIn('member');
    const { unmount } = await renderWithProviders(<HomeScreen />);
    expect(screen.queryByRole('tab', { name: /Family/ })).toBeNull();
    await unmount();

    signIn('admin');
    mockPending.mockResolvedValue([{}, {}]);
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByRole('tab', { name: 'Family, 2 waiting' })).toBeOnTheScreen();
    expect(screen.getByText('2 phones are waiting')).toBeOnTheScreen();
    await activate(/Family/);
    expect(screen.getByRole('header', { name: 'Family' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('home-approvals'));
    expect(mockPush).toHaveBeenCalledWith('/(admin)/approvals');
  });

  it('walks back through the pages visited, then lets the app go back', async () => {
    type Handler = Parameters<typeof BackHandler.addEventListener>[1];
    const handlers: Handler[] = [];
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h);
      return { remove: () => handlers.splice(handlers.indexOf(h), 1) };
    });
    const back = async () => {
      let handled: boolean | null | undefined = false;
      await act(async () => {
        handled = handlers.at(-1)?.({} as never);
      });
      return handled;
    };
    try {
      signIn('admin');
      await renderWithProviders(<HomeScreen />);
      await activate(/Family/);
      await activate('Settings');
      expect(screen.getByRole('tab', { name: 'Settings' })).toBeSelected();
      expect(await back()).toBe(true);
      expect(screen.getByRole('tab', { name: /Family/ })).toBeSelected();
      expect(await back()).toBe(true);
      expect(screen.getByRole('tab', { name: 'Vault' })).toBeSelected();
      expect(await back()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps security and account on Settings, and locks from the round button', async () => {
    signIn('member');
    await renderWithProviders(<HomeScreen />);
    // your initial in the top bar opens Settings
    await fireEvent.press(screen.getByRole('button', { name: 'Your account, Asha' }));
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeSelected();
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Lock after 1 min' })).toBeSelected(),
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Lock after 5 min' }));
    expect(screen.getByRole('radio', { name: 'Lock after 5 min' })).toBeSelected();
    expect(screen.getByTestId('home-change-pin')).toBeOnTheScreen();
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Lock now' }));
    });
    expect(mockLockNow).toHaveBeenCalledTimes(1);
  });
});
