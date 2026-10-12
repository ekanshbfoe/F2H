import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { setForbiddenHandler } from '@/services/supabase';
import { useSession } from '@/state/session.store';

import { checkDeviceStatus, endCooldown, lockNow, persistCooldown, wipe } from './api';
import { monotonicNow, remainingCooldownMs, useLock } from './lock.store';
import { shouldLock } from './model';
import { readBackgroundAt, readTimeoutMs, writeBackgroundAt } from './storage';

/** The wait still owed, ticking once a second and persisted on every tick (AC-4). */
export function useCooldown(): number {
  const state = useLock((s) => s.state);
  const cooldownMs = useLock((s) => s.cooldownMs);
  const startedAt = useLock((s) => s.cooldownStartedAt);
  const [now, setNow] = useState(monotonicNow);

  useEffect(() => {
    if (state !== 'cooling_down') return undefined;
    const id = setInterval(() => {
      const t = monotonicNow();
      setNow(t);
      const left = remainingCooldownMs({ state, cooldownMs, cooldownStartedAt: startedAt }, t);
      if (left <= 0) void endCooldown();
      else void persistCooldown();
    }, 1000);
    return () => clearInterval(id);
  }, [state, cooldownMs, startedAt]);

  if (state !== 'cooling_down') return 0;
  return Math.max(0, cooldownMs - (Math.max(now, startedAt) - startedAt));
}

export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function onAppState(next: AppStateStatus): Promise<void> {
  if (next === 'active') {
    const [backgroundAt, timeoutMs] = await Promise.all([readBackgroundAt(), readTimeoutMs()]);
    await writeBackgroundAt(null);
    if (
      useLock.getState().state === 'unlocked' &&
      shouldLock(backgroundAt, Date.now(), timeoutMs)
    ) {
      lockNow();
    }
    if (useSession.getState().phase === 'ready') await checkDeviceStatus().catch(() => undefined);
    return;
  }
  // The first step away from the foreground starts the clock; inactive then background keeps it.
  if ((await readBackgroundAt()) === null) await writeBackgroundAt(Date.now());
  await persistCooldown();
}

/** Locks after the chosen timeout in the background and re checks the device on return (AC-3, AC-10). */
export function useAutoLock(): void {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      void onAppState(next);
    });
    return () => sub.remove();
  }, []);
}

/** A 403 `device_not_approved` from any request wipes while the session is ready (AC-10). */
export function useRevokeGuard(): void {
  useEffect(() => {
    setForbiddenHandler(() => {
      if (useSession.getState().phase === 'ready') void wipe('revoked');
    });
    return () => setForbiddenHandler(null);
  }, []);
}

/**
 * Android: no screenshots and a blank recents thumbnail (AC-9). The root runtime holds the `f2h`
 * key from boot; a sensitive screen passes its own key, so leaving that screen releases only its
 * own hold and never the app wide one.
 */
export function useScreenCaptureBlock(key = 'f2h'): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    ScreenCapture.preventScreenCaptureAsync(key).catch(() => undefined);
    return () => {
      ScreenCapture.allowScreenCaptureAsync(key).catch(() => undefined);
    };
  }, [key]);
}

/** The current app state, for the privacy overlay (AC-9). */
export function useAppStateStatus(): AppStateStatus {
  const [status, setStatus] = useState<AppStateStatus>(AppState.currentState ?? 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', setStatus);
    return () => sub.remove();
  }, []);
  return status;
}
