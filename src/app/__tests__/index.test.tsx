import { screen, waitFor } from '@testing-library/react-native';

import { renderWithProviders } from '@/lib/test-utils';

import { useLock } from '@/features/lock/lock.store';

import BootScreen from '../index';

const mockReplace = jest.fn();
const mockResolve = jest.fn<Promise<string>, []>();
const mockAfterUnlock = jest.fn<Promise<string>, []>();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/features/auth/api', () => ({
  resolveBootRoute: () => mockResolve(),
  resolveAfterUnlock: () => mockAfterUnlock(),
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockResolve.mockReset();
  mockAfterUnlock.mockReset();
  useLock.setState({ state: 'no_pin' });
});

describe('BootScreen', () => {
  it('draws the splash logo while booting and routes to the resolved screen', async () => {
    mockResolve.mockResolvedValue('login');
    await renderWithProviders(<BootScreen />);
    expect(screen.getByLabelText('F2H')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Starting')).toBeNull();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/login'));
  });

  it('waits under the Unlock gate and continues once the PIN opens it (spec 0002, AC-2)', async () => {
    mockResolve.mockResolvedValue('unlock');
    mockAfterUnlock.mockResolvedValue('home');
    useLock.setState({ state: 'locked' });
    await renderWithProviders(<BootScreen />);
    await waitFor(() => expect(mockResolve).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
    useLock.setState({ state: 'unlocked' });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)/home'));
    expect(mockAfterUnlock).toHaveBeenCalledTimes(1);
  });

  it('shows a retry card when boot fails instead of hanging', async () => {
    mockResolve.mockRejectedValue(new Error('offline'));
    await renderWithProviders(<BootScreen />);
    expect(await screen.findByText(/Could not start: offline/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
