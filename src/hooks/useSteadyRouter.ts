import { useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';

/** A second tap this soon after opening a screen is the same tap landing twice. */
export const PUSH_GAP_MS = 700;

/**
 * The router, with a push that ignores a repeat within `PUSH_GAP_MS`: a quick double tap on a
 * tile or a row opens its screen once, not twice (which would then take two backs to leave).
 */
export function useSteadyRouter(): ReturnType<typeof useRouter> {
  const router = useRouter();
  const last = useRef(0);
  return useMemo(
    () => ({
      ...router,
      push: ((...args: Parameters<typeof router.push>) => {
        const now = Date.now();
        if (now - last.current < PUSH_GAP_MS) return;
        last.current = now;
        router.push(...args);
      }) as typeof router.push,
    }),
    [router],
  );
}
