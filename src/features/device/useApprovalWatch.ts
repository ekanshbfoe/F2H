import { useEffect, useRef, useState } from 'react';

import { supabase } from '@/services/supabase';
import type { Tables } from '@/types/database.types';

export type WatchedDevice = Pick<
  Tables<'devices'>,
  'id' | 'status' | 'model' | 'os' | 'name' | 'requested_at' | 'last_geo' | 'last_ip' | 'decided_at'
>;

const POLL_MS = 10_000;
const COLUMNS = 'id, status, model, os, name, requested_at, last_geo, last_ip, decided_at';

/**
 * Watches one device row: instant over Realtime (the JWT alone may read own rows) and a 10 s poll
 * as the fallback when the websocket is down (AC-7).
 */
export function useApprovalWatch(deviceId: string | null): {
  device: WatchedDevice | null;
  error: string | null;
} {
  const [device, setDevice] = useState<WatchedDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<string | null>(null);

  useEffect(() => {
    if (!deviceId) return undefined;
    let active = true;

    const apply = (row: WatchedDevice | null) => {
      if (!active || !row) return;
      latest.current = row.status;
      setDevice(row);
    };

    const fetchOnce = async () => {
      const { data, error: err } = await supabase
        .from('devices')
        .select(COLUMNS)
        .eq('id', deviceId)
        .maybeSingle();
      if (err) setError(err.message);
      else apply(data);
    };

    void fetchOnce();
    const timer = setInterval(() => {
      void fetchOnce();
    }, POLL_MS);
    const channel = supabase
      .channel(`device-${deviceId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'devices', filter: `id=eq.${deviceId}` },
        (payload) => apply(payload.new as WatchedDevice),
      )
      .subscribe();

    return () => {
      active = false;
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [deviceId]);

  return { device, error };
}
