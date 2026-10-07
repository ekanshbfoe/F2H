import { screen, waitFor } from '@testing-library/react-native';

import { renderWithProviders } from '@/lib/test-utils';

import BootScreen from '../index';

const mockReplace = jest.fn();
const mockResolve = jest.fn<Promise<string>, []>();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/features/auth/api', () => ({ resolveBootRoute: () => mockResolve() }));

beforeEach(() => {
  mockReplace.mockClear();
  mockResolve.mockReset();
});

describe('BootScreen', () => {
  it('renders the brand while booting and routes to the resolved screen', async () => {
    mockResolve.mockResolvedValue('login');
    await renderWithProviders(<BootScreen />);
    expect(screen.getByRole('header', { name: 'F2H' })).toBeOnTheScreen();
    expect(screen.getByText(/private vault/i)).toBeOnTheScreen();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/login'));
  });

  it('shows a retry card when boot fails instead of hanging', async () => {
    mockResolve.mockRejectedValue(new Error('offline'));
    await renderWithProviders(<BootScreen />);
    expect(await screen.findByText(/Could not start: offline/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
