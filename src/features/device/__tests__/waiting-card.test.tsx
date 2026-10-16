// covers: AC-1 (the kit card: admin only, main vs secondary, offline retry) and AC-4 (the watcher
// does not route on approved while a self approval is running) of spec 0001-admin-device-self-approval
import { screen, userEvent, waitFor } from '@testing-library/react-native';

import WaitingScreen from '@/app/(auth)/waiting';
import { renderWithProviders } from '@/lib/test-utils';
import { useSession } from '@/state/session.store';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockFetchPub = jest.fn<Promise<{ recovery_pub: string; fingerprint: string } | null>, []>();
const mockCount = jest.fn<Promise<number | null>, []>();
const mockComplete = jest.fn(async () => 'set-pin' as const);
let mockDevice: { id: string; status: string; model: string; os: string } | null = null;

jest.mock('expo-router', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
    addListener: jest.fn(() => () => undefined),
    dispatch: jest.fn(),
  }),
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn() }),
}));
jest.mock('@/features/auth/api', () => ({
  cancelMyRequest: jest.fn(async () => undefined),
  completeApproval: () => mockComplete(),
  fetchRecoveryPubkey: () => mockFetchPub(),
  wipeLocalState: jest.fn(async () => undefined),
}));
jest.mock('@/features/device/approved-count', () => ({
  countMyApprovedDevices: () => mockCount(),
}));
jest.mock('@/features/device/useApprovalWatch', () => ({
  useApprovalWatch: () => ({ device: mockDevice, error: null }),
}));

const admin = {
  id: 'u1',
  email: 'a@x',
  display_name: 'Ekansh',
  role: 'admin' as const,
  status: 'active' as const,
};
const member = { ...admin, id: 'u2', display_name: 'Bro', role: 'member' as const };
const pending = { id: 'd1', status: 'pending', model: 'LAVA', os: 'Android' };

beforeEach(() => {
  mockReplace.mockClear();
  mockPush.mockClear();
  mockComplete.mockClear();
  mockFetchPub.mockReset();
  mockFetchPub.mockResolvedValue({ recovery_pub: 'AA==', fingerprint: 'f' });
  mockCount.mockReset();
  mockCount.mockResolvedValue(0);
  mockDevice = pending;
  useSession.setState({ profile: admin, deviceId: 'd1', selfApproving: false });
});

describe('waiting screen recovery kit card (AC-1)', () => {
  it('shows the main action when the Admin has no other approved phone', async () => {
    await renderWithProviders(<WaitingScreen />);
    expect(await screen.findByText('Use my recovery kit')).toBeOnTheScreen();
    const open = await screen.findByRole('button', { name: 'Enter my 24 words' });
    await waitFor(() => expect(open).not.toBeDisabled());
    await userEvent.setup().press(open);
    expect(mockPush).toHaveBeenCalledWith('/(auth)/recovery-words');
  });

  it('shows the secondary link when another admin phone could approve', async () => {
    mockCount.mockResolvedValue(2);
    await renderWithProviders(<WaitingScreen />);
    expect(await screen.findByText("Can't reach your other phone?")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Use the recovery kit instead' })).toBeOnTheScreen();
  });

  it('never shows the card to a member', async () => {
    useSession.setState({ profile: member });
    await renderWithProviders(<WaitingScreen />);
    expect(await screen.findByText('Pending approval')).toBeOnTheScreen();
    expect(screen.queryByTestId('kit-card')).toBeNull();
    expect(mockFetchPub).not.toHaveBeenCalled();
  });

  it('disables the card with a retry when the published key cannot be fetched', async () => {
    mockFetchPub.mockRejectedValueOnce(new Error('offline'));
    await renderWithProviders(<WaitingScreen />);
    expect(await screen.findByText(/could not be fetched/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Enter my 24 words' })).toBeNull();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Enter my 24 words' })).toBeOnTheScreen();
  });
});

describe('watcher ordering during a self approval (AC-4)', () => {
  it('routes on approved normally', async () => {
    mockDevice = { ...pending, status: 'approved' };
    await renderWithProviders(<WaitingScreen />);
    await waitFor(() => expect(mockComplete).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith('/(lock)/set-pin');
  });

  it('leaves the transition to the words screen while selfApproving is set', async () => {
    mockDevice = { ...pending, status: 'approved' };
    useSession.setState({ selfApproving: true });
    await renderWithProviders(<WaitingScreen />);
    expect(await screen.findByText('Pending approval')).toBeOnTheScreen();
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
