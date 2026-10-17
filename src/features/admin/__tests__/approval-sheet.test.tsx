// covers: AC-10, AC-11 of spec 0002 (approve only a verified wrap; the decision lands)
import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/lib/test-utils';
import { useSession } from '@/state/session.store';

import { ApprovalSheet } from '../approval/ApprovalSheet';
import { useApprovalPrompt } from '../approval/prompt';

const mockDecide = jest.fn();
const mockVerify = jest.fn();

jest.mock('@/features/keyring/admin-recovery', () => ({
  loadRecoverySecretKey: async () => new Uint8Array(32),
}));
jest.mock('../api', () => ({
  fetchApprovalMaterial: async () => ({ user_id: 'm1', mk_wrapped_admin: '', mk_verifier: '' }),
  verifyMemberWrap: () => mockVerify(),
  decideDevice: (id: string, d: string) => mockDecide(id, d),
}));

const device = {
  id: 'd1',
  user_id: 'm1',
  display_name: 'Brother',
  model: 'Redmi 9',
  os: 'Android 10',
  last_geo: { city: 'Delhi', country_code: 'IN' },
  requested_at: '2026-10-17T01:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ mk: new Uint8Array(32) });
  useApprovalPrompt.setState({ device: null, seen: [] });
});

async function open() {
  await renderWithProviders(<ApprovalSheet />);
  await act(async () => {
    useApprovalPrompt.getState().show(device as never);
  });
}

describe('ApprovalSheet', () => {
  it('approves a verified request and lands on All set with the phone card', async () => {
    mockVerify.mockReturnValue(new Uint8Array(32));
    mockDecide.mockResolvedValue('approved');
    await open();
    expect(await screen.findByText('Key material verified')).toBeOnTheScreen();
    // the panel is drawn over the measured sheet; Jest measures nothing on its own
    await act(async () => {
      fireEvent(screen.getByTestId('approve-morph'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 420 } },
      });
    });
    await userEvent.setup().press(screen.getByText('Approve'));
    expect(mockDecide).toHaveBeenCalledWith('d1', 'approve');
    expect(await screen.findByText('All set')).toBeOnTheScreen();
    expect(screen.getByTestId('approve-card')).toBeOnTheScreen();
    expect(screen.getByText('Redmi 9')).toBeOnTheScreen();
  });

  it('never approves a wrap that does not verify', async () => {
    mockVerify.mockReturnValue(null);
    await open();
    expect(await screen.findByText('Key material tampered')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByText('Approve unavailable'));
    expect(mockDecide).not.toHaveBeenCalled();
  });
});
