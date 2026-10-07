// Regression: expo-notifications throws on import in Expo Go on Android (SDK 53+); the app must boot anyway.
import { Platform } from 'react-native';
import { getPushToken, isExpoGo, loadNotifications } from '../push';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    executionEnvironment: 'storeClient',
    expoConfig: { extra: { eas: { projectId: 'p' } } },
  },
  ExecutionEnvironment: { StoreClient: 'storeClient', Standalone: 'standalone', Bare: 'bare' },
}));
jest.mock('expo-notifications', () => {
  throw new Error('expo-notifications: Android Push notifications ... removed from Expo Go');
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('push in Expo Go on Android', () => {
  const originalOS = Platform.OS;
  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  });
  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  it('never imports expo-notifications and reports no token', async () => {
    expect(isExpoGo()).toBe(true);
    expect(loadNotifications()).toBeNull();
    await expect(getPushToken()).resolves.toBeNull();
  });
});
