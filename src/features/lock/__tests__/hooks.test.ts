// covers: AC-9 of spec 0002 (a screen's own screenshot hold never releases the app wide one)
import { renderHook } from '@testing-library/react-native';
import * as ScreenCapture from 'expo-screen-capture';
import { Platform } from 'react-native';

import { useScreenCaptureBlock } from '../hooks';

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
}));
jest.mock('@/services/supabase', () => ({ setForbiddenHandler: jest.fn(), supabase: {} }));

const prevent = ScreenCapture.preventScreenCaptureAsync as jest.Mock;
const allow = ScreenCapture.allowScreenCaptureAsync as jest.Mock;

describe('useScreenCaptureBlock', () => {
  const os = Platform.OS;
  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  });
  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  });

  it('holds and releases only its own key', async () => {
    const root = await renderHook(() => useScreenCaptureBlock());
    const screen = await renderHook(() => useScreenCaptureBlock('f2h:show-kit'));
    expect(prevent.mock.calls.map((c) => c[0])).toEqual(['f2h', 'f2h:show-kit']);
    await screen.unmount();
    expect(allow.mock.calls.map((c) => c[0])).toEqual(['f2h:show-kit']);
    await root.unmount();
    expect(allow.mock.calls.map((c) => c[0])).toEqual(['f2h:show-kit', 'f2h']);
  });
});
