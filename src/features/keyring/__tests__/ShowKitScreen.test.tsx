// covers: the "Show my recovery kit" screen (words from the vault note, fingerprint checked
// against the published key, admin only, unlocked only)
import { screen, userEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/lib/test-utils';
import { useSession } from '@/state/session.store';

import { ShowKitScreen } from '../screens/ShowKitScreen';

const WORDS = Array.from({ length: 24 }, (_, i) => `word${i + 1}`);
const mockExport = jest.fn();
const mockFetchPub = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
    addListener: jest.fn(() => () => undefined),
    dispatch: jest.fn(),
  }),
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/features/lock/hooks', () => ({ useScreenCaptureBlock: () => undefined }));
jest.mock('@/features/lock/api', () => ({
  withKey: (fn: (mk: Uint8Array) => Promise<unknown>) => fn(new Uint8Array(32)),
}));
jest.mock('@/features/auth/api', () => ({ fetchRecoveryPubkey: () => mockFetchPub() }));
jest.mock('../admin-recovery', () => ({ exportRecoveryKit: () => mockExport() }));

const admin = {
  id: 'u1',
  email: 'a@x',
  display_name: 'A',
  role: 'admin' as const,
  status: 'active' as const,
};

beforeEach(() => {
  mockExport.mockReset();
  mockFetchPub.mockReset();
  mockExport.mockResolvedValue({
    words: WORDS,
    fingerprint: '2d2a 90fe cb58 1c85',
    publicKey: 'PUB',
  });
  useSession.setState({ profile: admin, mk: new Uint8Array(32) });
});

describe('ShowKitScreen', () => {
  it('shows the 24 words and confirms the published key matches', async () => {
    mockFetchPub.mockResolvedValue({ recovery_pub: 'PUB', fingerprint: '2d2a 90fe cb58 1c85' });
    await renderWithProviders(<ShowKitScreen />);
    expect(screen.queryByText('word1')).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Show the 24 words' }));
    expect(await screen.findByText('Matches the published family key')).toBeOnTheScreen();
    expect(screen.getByText('word24')).toBeOnTheScreen();
    expect(screen.getByTestId('show-kit-fingerprint')).toHaveTextContent('2d2a90fecb581c85');
    expect(screen.getByLabelText('Fingerprint 2d2a 90fe cb58 1c85')).toBeOnTheScreen();
  });

  it('warns when the stored words do not match the published key', async () => {
    mockFetchPub.mockResolvedValue({ recovery_pub: 'OTHER', fingerprint: 'ffff 0000 1111 2222' });
    await renderWithProviders(<ShowKitScreen />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Show the 24 words' }));
    expect(await screen.findByText(/do not match the published key/)).toBeOnTheScreen();
  });

  it('refuses members and a locked vault', async () => {
    useSession.setState({ mk: null });
    const { unmount } = await renderWithProviders(<ShowKitScreen />);
    expect(screen.getByText('Unlock the app with your PIN first.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Show the 24 words' })).toBeDisabled();
    unmount();
    useSession.setState({ profile: { ...admin, role: 'member' } });
    await renderWithProviders(<ShowKitScreen />);
    expect(screen.getByText('Only the Admin has a recovery kit.')).toBeOnTheScreen();
    expect(mockExport).not.toHaveBeenCalled();
  });
});
