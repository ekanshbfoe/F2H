// Global test setup. Keep it minimal; feature tests add their own mocks.
import 'react-native-gesture-handler/jestSetup';

// Reanimated 4 runs in Jest through react-native-worklets' resolver (jest.config.js),
// which swaps the native worklets bindings for their JS fallbacks.
require('react-native-reanimated').setUpTests();

// AsyncStorage has no native module in Jest; the package ships an in memory mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Haptics have no native module in Jest; every call resolves and does nothing.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  performAndroidHapticsAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  AndroidHaptics: { Virtual_Key: 'virtual-key' },
}));

// Audio has no native module in Jest: players are inert stand ins.
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async () => undefined),
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    seekTo: jest.fn(async () => undefined),
    remove: jest.fn(),
  })),
}));
