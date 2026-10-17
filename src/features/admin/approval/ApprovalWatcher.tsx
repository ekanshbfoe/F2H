import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';

import { useLock } from '@/features/lock/lock.store';
import { useSession } from '@/state/session.store';

import { listPendingDevices, subscribePendingDevices } from '../api';
import { useApprovalPrompt } from './prompt';

/**
 * Pops the approval sheet over whatever screen the Admin is on the moment a phone asks to join.
 * It watches only while this phone is the Admin's and the vault is unlocked (the check needs the
 * recovery key); a request that arrives while locked pops up right after the unlock. A request
 * pops up once: closing it leaves it in the Approvals list.
 */
export function ApprovalWatcher() {
  const admin = useSession((s) => s.phase === 'ready' && s.profile?.role === 'admin');
  const unlocked = useLock((s) => s.state === 'unlocked');
  const watching = admin && unlocked;

  useEffect(() => {
    if (!watching) {
      useApprovalPrompt.getState().close();
      return undefined;
    }
    let live = true;
    const look = () => {
      listPendingDevices()
        .then((rows) => {
          const prompt = useApprovalPrompt.getState();
          if (!live || prompt.device) return;
          // the oldest request not shown yet
          const next = [...rows].reverse().find((d) => d.id && !prompt.seen.includes(d.id));
          if (!next) return;
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          prompt.show(next);
        })
        .catch(() => undefined);
    };
    look();
    const stop = subscribePendingDevices(look);
    return () => {
      live = false;
      stop();
    };
  }, [watching]);

  return null;
}
