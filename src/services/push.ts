import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Screens a push can open. The payload carries `screen`; the router does the rest. */
const SCREEN_ROUTES = {
  approvals: '/(admin)/approvals',
  waiting: '/(auth)/waiting',
} as const;

type PushScreen = keyof typeof SCREEN_ROUTES;
type NotificationsModule = typeof import('expo-notifications');

let notifications: NotificationsModule | null | undefined;
let handlerInstalled = false;

/** True inside the Expo Go client (remote push was removed there on Android with SDK 53). */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * `expo-notifications` throws the moment it is imported in Expo Go on Android, so it is loaded
 * lazily and only where it can work. Everywhere else push simply reports "unavailable".
 */
export function loadNotifications(): NotificationsModule | null {
  if (notifications !== undefined) return notifications;
  if (isExpoGo() && Platform.OS === 'android') {
    notifications = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notifications = require('expo-notifications') as NotificationsModule;
  } catch {
    notifications = null;
  }
  return notifications;
}

function installForegroundHandler(mod: NotificationsModule) {
  if (handlerInstalled) return;
  handlerInstalled = true;
  mod.setNotificationHandler({
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
 * The Expo push token for this install, or null when unavailable: Expo Go on Android, permission
 * refused, or no EAS project id. Registration continues without it (Realtime still works).
 */
export async function getPushToken(): Promise<string | null> {
  const mod = loadNotifications();
  if (!mod) return null;
  try {
    installForegroundHandler(mod);
    if (Platform.OS === 'android') {
      await mod.setNotificationChannelAsync('default', {
        name: 'F2H',
        importance: mod.AndroidImportance.HIGH,
      });
    }
    const current = await mod.getPermissionsAsync();
    const granted = current.granted || (await mod.requestPermissionsAsync()).granted === true;
    if (!granted) return null;
    const id = projectId();
    if (!id) return null;
    const token = await mod.getExpoPushTokenAsync({ projectId: id });
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
    const mod = loadNotifications();
    if (!mod) return undefined;
    installForegroundHandler(mod);
    let active = true;
    mod
      .getLastNotificationResponseAsync()
      .then((response) => {
        const route = response ? routeFor(response.notification.request.content.data) : null;
        if (active && route) router.push(route);
      })
      .catch(() => undefined);
    const sub = mod.addNotificationResponseReceivedListener((response) => {
      const route = routeFor(response.notification.request.content.data);
      if (route) router.push(route);
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, [router]);
}
