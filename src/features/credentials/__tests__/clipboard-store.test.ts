// covers: AC-4 (clipboard clears after 30 s only if it still holds our value) and AC-8 (a lock
// clears the store and the clipboard at once) of spec 0004
import * as Clipboard from 'expo-clipboard';

import { useLock } from '@/features/lock/lock.store';
import { CLIPBOARD_CLEAR_MS, copySecret, hasPendingSecret } from '@/services/clipboard';

import { useCredentials } from '../store';

let mockBoard = '';
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async (s: string) => {
    mockBoard = s;
    return true;
  }),
  getStringAsync: jest.fn(async () => mockBoard),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  mockBoard = '';
  (Clipboard.setStringAsync as jest.Mock).mockClear();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('copySecret', () => {
  it('clears the clipboard after 30 seconds', async () => {
    await copySecret('s3cret');
    expect(mockBoard).toBe('s3cret');
    jest.advanceTimersByTime(CLIPBOARD_CLEAR_MS - 1);
    await flush();
    expect(mockBoard).toBe('s3cret');
    jest.advanceTimersByTime(1);
    await flush();
    expect(mockBoard).toBe('');
    expect(hasPendingSecret()).toBe(false);
  });

  it('leaves a value copied afterwards alone', async () => {
    await copySecret('s3cret');
    mockBoard = 'my own note';
    jest.advanceTimersByTime(CLIPBOARD_CLEAR_MS);
    await flush();
    expect(mockBoard).toBe('my own note');
  });

  it('restarts the window on a second copy', async () => {
    await copySecret('first');
    jest.advanceTimersByTime(20_000);
    await copySecret('second');
    jest.advanceTimersByTime(20_000);
    await flush();
    expect(mockBoard).toBe('second');
    jest.advanceTimersByTime(10_000);
    await flush();
    expect(mockBoard).toBe('');
  });

  it('a lock clears the clipboard and the store at once (AC-8)', async () => {
    useCredentials.setState({
      status: 'ready',
      items: { c1: { id: 'c1', version: 1, payload: {} as never } },
    });
    await copySecret('s3cret');
    useLock.getState().bumpGeneration();
    await flush();
    expect(mockBoard).toBe('');
    expect(useCredentials.getState().items).toEqual({});
    expect(useCredentials.getState().status).toBe('idle');
  });
});
