/** Expo Push API. Free, no credentials in code; FCM/APNs live in EAS for production builds. */

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/**
 * The Android channel the app creates with HIGH importance (src/services/push.ts). Without it
 * Android may file the push in a quiet fallback channel that never drops down over other apps.
 */
const ANDROID_CHANNEL = 'default';
/** Both shapes Expo hands out: the older `ExponentPushToken[...]` and the newer `ExpoPushToken[...]`. */
const EXPO_TOKEN = /^Expo(nent)?PushToken\[.+\]$/;

/** Sends one message to every token; invalid or empty tokens are skipped. Never throws on delivery errors. */
export async function sendPush(
  tokens: (string | null | undefined)[],
  message: PushMessage,
): Promise<PushTicket[]> {
  const to = tokens.filter((t): t is string => typeof t === 'string' && EXPO_TOKEN.test(t));
  if (to.length === 0) return [];
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        to.map((token) => ({
          to: token,
          sound: 'default',
          priority: 'high',
          channelId: ANDROID_CHANNEL,
          ...message,
        })),
      ),
    });
    if (!res.ok) {
      console.error('expo push failed', res.status);
      return [];
    }
    const body = (await res.json()) as { data?: PushTicket[] };
    return body.data ?? [];
  } catch (error) {
    console.error('expo push error', error instanceof Error ? error.message : String(error));
    return [];
  }
}
