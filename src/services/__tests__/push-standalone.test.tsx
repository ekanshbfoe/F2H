// The built app (not Expo Go): a tapped push opens its screen once, and an approval push does
// not banner over the open app, where the approval sheet pops up instead.
import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { getPushToken, usePushNavigation } from '../push';

const mockPush = jest.fn();
const mockClear = jest.fn();
let mockHandler: {
  handleNotification: (n: unknown) => Promise<{ shouldShowBanner: boolean }>;
} | null = null;
const tapped = { notification: { request: { content: { data: { screen: 'approvals' } } } } };

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    executionEnvironment: 'standalone',
    expoConfig: { extra: { eas: { projectId: 'p' } } },
  },
  ExecutionEnvironment: { StoreClient: 'storeClient', Standalone: 'standalone', Bare: 'bare' },
}));
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: (h: typeof mockHandler) => {
    mockHandler = h;
  },
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: async () => ({ granted: true }),
  requestPermissionsAsync: async () => ({ granted: true }),
  getExpoPushTokenAsync: async () => ({ data: 'ExpoPushToken[abc]' }),
  getLastNotificationResponseAsync: async () => tapped,
  clearLastNotificationResponse: () => mockClear(),
  addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const note = (screen: string) => ({ request: { content: { data: { screen } } } });

describe('push in the built app', () => {
  const originalOS = Platform.OS;
  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  });
  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  it('opens the tapped screen and clears the tap so a later start does not reopen it', async () => {
    await renderHook(() => usePushNavigation());
    await new Promise((r) => setTimeout(r, 0));
    expect(mockPush).toHaveBeenCalledWith('/(admin)/approvals');
    expect(mockClear).toHaveBeenCalled();
  });

  it('hides the banner for an approval while F2H is open, keeps it for others', async () => {
    await expect(getPushToken()).resolves.toBe('ExpoPushToken[abc]');
    expect((await mockHandler?.handleNotification(note('approvals')))?.shouldShowBanner).toBe(
      false,
    );
    expect((await mockHandler?.handleNotification(note('activity')))?.shouldShowBanner).toBe(true);
  });
});
