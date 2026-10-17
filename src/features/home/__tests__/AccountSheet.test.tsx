// covers: spec 0005 AC-1 (the Admin is told the member is notified before a vault opens)
import { act, screen, userEvent } from '@testing-library/react-native';

import { ConfirmHost } from '@/components/ui';
import { renderWithProviders } from '@/lib/test-utils';
import { useSession } from '@/state/session.store';

import { AccountSheet } from '../components/AccountSheet';

const mockPush = jest.fn();
const mockList = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/features/admin/api', () => ({ listMembers: () => mockList() }));

const admin = {
  id: 'u1',
  email: 'ekansh@x',
  display_name: 'Admin',
  role: 'admin' as const,
  status: 'active' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue({
    profiles: [
      admin,
      { id: 'u2', email: 'b@x', display_name: 'BFOE', role: 'member', status: 'active' },
      { id: 'u3', email: 'm@x', display_name: 'Mum', role: 'member', status: 'pending' },
    ],
    allowed: [{ email: 'b@x', label: 'Brother', invite_expires_at: null, consumed_at: 'x' }],
  });
});

async function show() {
  await renderWithProviders(
    <>
      <AccountSheet open onClose={jest.fn()} onSettings={jest.fn()} />
      <ConfirmHost />
    </>,
  );
}

describe('AccountSheet', () => {
  it('lists the family for the Admin and opens a vault only after the logged confirm', async () => {
    useSession.setState({ profile: admin });
    await show();
    expect(await screen.findByText('BFOE')).toBeOnTheScreen();
    expect(screen.getByText('Brother')).toBeOnTheScreen();
    expect(screen.getByText('Waiting for approval · m@x')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByTestId('account-member-u2'));
    expect(await screen.findByText("Open BFOE's vault?")).toBeOnTheScreen();
    expect(mockPush).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('confirm-accept'));
    await act(async () => undefined);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(admin)/oversight/[userId]',
      params: { userId: 'u2', name: 'BFOE' },
    });
  });

  it('shows a member only their own account', async () => {
    useSession.setState({ profile: { ...admin, role: 'member', display_name: 'BFOE' } });
    await show();
    expect(screen.getByText('Account settings')).toBeOnTheScreen();
    expect(screen.queryByText('Family vaults')).toBeNull();
    expect(mockList).not.toHaveBeenCalled();
  });
});
