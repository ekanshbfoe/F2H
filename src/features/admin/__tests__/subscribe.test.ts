// Regression: Home and Approvals both watch pending devices; a shared channel name made the second
// subscriber add a listener after subscribe(), which the Supabase client refuses.
import { subscribePendingDevices } from '../api';

const mockChannels: { name: string; on: jest.Mock; subscribe: jest.Mock }[] = [];
const mockRemoveChannel = jest.fn(async (_c: unknown) => 'ok');

jest.mock('@/services/supabase', () => ({
  supabase: {
    channel: (name: string) => {
      const ch = { name, on: jest.fn(), subscribe: jest.fn() };
      ch.on.mockReturnValue(ch);
      ch.subscribe.mockReturnValue(ch);
      mockChannels.push(ch);
      return ch;
    },
    removeChannel: (c: unknown) => mockRemoveChannel(c),
  },
}));

describe('subscribePendingDevices', () => {
  it('gives every subscriber its own channel and removes exactly that channel on unsubscribe', () => {
    const offA = subscribePendingDevices(() => undefined);
    const offB = subscribePendingDevices(() => undefined);
    expect(mockChannels).toHaveLength(2);
    expect(mockChannels[0]?.name).not.toBe(mockChannels[1]?.name);
    expect(mockChannels.every((c) => c.name.startsWith('admin-pending-devices-'))).toBe(true);
    for (const c of mockChannels) {
      expect(c.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({ table: 'devices' }),
        expect.any(Function),
      );
      expect(c.subscribe).toHaveBeenCalledTimes(1);
    }
    offA();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannels[0]);
    offB();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannels[1]);
  });

  it('forwards every change event to the subscriber', () => {
    const onChange = jest.fn();
    subscribePendingDevices(onChange);
    const handler = mockChannels.at(-1)?.on.mock.calls[0]?.[2] as (() => void) | undefined;
    handler?.();
    handler?.();
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
