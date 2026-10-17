import { useEffect, useRef } from 'react';

import { useLock } from '@/features/lock/lock.store';
import { getPushToken } from '@/services/push';
import { supabase } from '@/services/supabase';
import { useSession } from '@/state/session.store';

/**
 * Saves this phone's current push address on its own device row. Registration stores it once,
 * so a phone that refused notifications then and allowed them later, or whose address changed,
 * would never be reached; RLS lets the owner change only this column. Null (Expo Go on Android,
 * still refused) leaves the row as it is.
 */
export async function syncPushToken(deviceId: string): Promise<void> {
  const token = await getPushToken();
  if (!token) return;
  await supabase.from('devices').update({ push_token: token }).eq('id', deviceId);
}

/** Runs `syncPushToken` once per app run, the first time the vault is open on an approved phone. */
export function usePushTokenSync(): void {
  const deviceId = useSession((s) => (s.phase === 'ready' ? s.deviceId : null));
  const unlocked = useLock((s) => s.state === 'unlocked');
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!deviceId || !unlocked || done.current === deviceId) return;
    done.current = deviceId;
    syncPushToken(deviceId).catch(() => {
      done.current = null;
    });
  }, [deviceId, unlocked]);
}
