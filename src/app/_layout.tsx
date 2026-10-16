import '@/crypto/polyfill';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LockRuntime } from '@/features/lock/LockRuntime';
import { usePushNavigation } from '@/services/push';
import { ThemeProvider, colors, useAppFonts } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden (fast refresh); nothing to do */
});

/**
 * Screens reached by replacing the whole stack (start up, sign in, the vault opening, a wipe):
 * there is nothing to go back to, so they fade in instead of sliding as if pushed.
 */
const FADE_IN = [
  'index',
  'onboarding',
  '(auth)/login',
  '(auth)/waiting',
  '(auth)/denied',
  '(app)/home',
  '(lock)/set-pin',
  '(lock)/wiped',
] as const;

/** Opens the screen a tapped push names. Rendered inside the providers so the router exists. */
function PushNavigation() {
  usePushNavigation();
  return null;
}

export default function RootLayout() {
  const { ready } = useAppFonts();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StatusBar style="dark" />
          <PushNavigation />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.canvas },
              // iPhone style everywhere: a screen slides in from the right over a parallax of
              // the one below, and a swipe from the left edge takes it back
              animation: 'ios_from_right',
              gestureEnabled: true,
              fullScreenGestureEnabled: true,
            }}
          >
            {/* hand offs, not steps forward: these arrive with a short fade */}
            {FADE_IN.map((name) => (
              <Stack.Screen key={name} name={name} options={{ animation: 'fade' }} />
            ))}
          </Stack>
          <LockRuntime />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
