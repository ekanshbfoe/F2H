import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { callFunction } from '@/services/functions';
import { supabase } from '@/services/supabase';
import { whileAway } from '@/features/lock/away';

/**
 * Linking the two Google Drives (child spec 0001-drive-redundancy, AC-1, AC-2). The consent page
 * opens in an auth session; the callback function stores the refresh token in Vault and sends the
 * browser back to this app's deep link with `?slot=…&status=…`. The phone never sees a token.
 */

export type Slot = 'a' | 'b';

export interface DriveSlotStatus {
  slot: Slot;
  google_email: string;
  status: 'active' | 'needs_relink';
  bytes_used: number;
  linked_at: string;
}

export async function listDriveStatus(): Promise<DriveSlotStatus[]> {
  const { data, error } = await supabase
    .from('drive_status_view')
    .select('slot, google_email, status, bytes_used, linked_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as DriveSlotStatus[];
}

export type LinkOutcome = 'linked' | 'cancelled' | 'failed';

export function parseLinkResult(url: string | null | undefined): LinkOutcome {
  if (!url) return 'cancelled';
  const status = /[?&]status=([a-z]+)/.exec(url)?.[1];
  return status === 'linked' ? 'linked' : status === 'cancelled' ? 'cancelled' : 'failed';
}

export async function linkSlot(slot: Slot): Promise<LinkOutcome> {
  const returnUrl = Linking.createURL('drive-linked');
  const { auth_url } = await callFunction<{ auth_url: string }>('drive-link-start', {
    slot,
    return_url: returnUrl,
  });
  const result = await whileAway(() => WebBrowser.openAuthSessionAsync(auth_url, returnUrl));
  if (result.type !== 'success') return 'cancelled';
  return parseLinkResult(result.url);
}
