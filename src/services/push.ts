import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Screens a push can open. The payload carries `screen`; the router does the rest. */
const SCREEN_ROUTES = {
  approvals: '/(admin)/approvals',
  waiting: '/(auth)/waiting',
} as const;

type PushScreen = keyof typeof SCREEN_ROUTES;

let handlerInstalled = false;

function installForegroundHandler() {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function projectId(): string | undefined {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  return fromConfig ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? undefined;
}

/**
 * The Expo push token for this install, or null when unavailable: permission refused, no EAS
 * project id, or Expo Go on Android (remote push is not supported there since SDK 53).
 */
export async function getPushToken(): Promise<string | null> {
  try {
    installForegroundHandler();
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'F2H',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    const granted =
      current.granted || (await Notifications.requestPermissionsAsync()).granted === true;
    if (!granted) return null;
    const id = projectId();
    if (!id) return null;
    const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
    return token.data || null;
  } catch {
    return null;
  }
}

function routeFor(data: unknown): (typeof SCREEN_ROUTES)[PushScreen] | null {
  const screen = (data as { screen?: string } | null)?.screen;
  return screen && screen in SCREEN_ROUTES ? SCREEN_ROUTES[screen as PushScreen] : null;
}

/** Opens the screen a tapped push names (approvals for the Admin, waiting for a member). */
export function usePushNavigation(): void {
  const router = useRouter();
  useEffect(() => {
    installForegroundHandler();
    let active = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const route = response ? routeFor(response.notification.request.content.data) : null;
        if (active && route) router.push(route);
      })
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = routeFor(response.notification.request.content.data);
      if (route) router.push(route);
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, [router]);
}
