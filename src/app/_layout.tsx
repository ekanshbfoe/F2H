import '@/crypto/polyfill';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { usePushNavigation } from '@/services/push';
import { ThemeProvider, colors, useAppFonts } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden (fast refresh); nothing to do */
});

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
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}
          />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
