// covers: AC-9 of spec 0002 (the Admin sees a new sign in the moment it happens), app wide
import { act, render } from '@testing-library/react-native';

import { useLock } from '@/features/lock/lock.store';
import { useSession } from '@/state/session.store';

import { ApprovalWatcher } from '../approval/ApprovalWatcher';
import { useApprovalPrompt } from '../approval/prompt';

const mockList = jest.fn();
let mockOnChange: () => void = () => undefined;

jest.mock('../api', () => ({
  listPendingDevices: () => mockList(),
  subscribePendingDevices: (cb: () => void) => {
    mockOnChange = cb;
    return () => undefined;
  },
}));

const admin = {
  id: 'u1',
  email: 'a@x',
  display_name: 'A',
  role: 'admin' as const,
  status: 'active' as const,
};
const request = (id: string, at: string) => ({
  id,
  user_id: 'm1',
  display_name: 'B',
  requested_at: at,
});

// the list loads through a resolved promise and then sets state: two turns settle it
async function flush() {
  await act(async () => undefined);
  await act(async () => undefined);
}

beforeEach(() => {
  mockList.mockReset();
  useApprovalPrompt.setState({ device: null, seen: [] });
  useSession.setState({ phase: 'ready', profile: admin });
  useLock.setState({ state: 'unlocked' });
});

describe('ApprovalWatcher', () => {
  it('pops up the oldest new request, once', async () => {
    mockList.mockResolvedValue([
      request('d2', '2026-10-17T02:00Z'),
      request('d1', '2026-10-17T01:00Z'),
    ]);
    const view = await render(<ApprovalWatcher />);
    await flush();
    expect(useApprovalPrompt.getState().device?.id).toBe('d1');
    await act(async () => {
      useApprovalPrompt.getState().close();
    });
    await act(async () => {
      mockOnChange();
    });
    await flush();
    expect(useApprovalPrompt.getState().device?.id).toBe('d2');
    await act(async () => {
      useApprovalPrompt.getState().close();
    });
    await act(async () => {
      mockOnChange();
    });
    await flush();
    expect(useApprovalPrompt.getState().device).toBeNull();
    await view.unmount();
  });

  it('stays quiet for a member', async () => {
    mockList.mockResolvedValue([request('d1', '2026-10-17T01:00Z')]);
    useSession.setState({ profile: { ...admin, role: 'member' } });
    const view = await render(<ApprovalWatcher />);
    await flush();
    expect(mockList).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('waits for the unlock, then pops up what came in meanwhile', async () => {
    mockList.mockResolvedValue([request('d1', '2026-10-17T01:00Z')]);
    useLock.setState({ state: 'locked' });
    const view = await render(<ApprovalWatcher />);
    await flush();
    expect(useApprovalPrompt.getState().device).toBeNull();
    await act(async () => {
      useLock.setState({ state: 'unlocked' });
    });
    await flush();
    expect(useApprovalPrompt.getState().device?.id).toBe('d1');
    await view.unmount();
  });
});
