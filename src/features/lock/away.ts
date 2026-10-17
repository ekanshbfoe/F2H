/**
 * Trips the app sends the person on itself (the file picker, Google sign in for a Drive). The
 * phone counts them as the app going to the background, so without this a slow pick past the
 * auto lock timeout came back to the PIN screen and lost the file it picked. While one is under
 * way the auto lock clock gets `AWAY_GRACE_MS` extra, so a forgotten picker still locks.
 */
export const AWAY_GRACE_MS = 5 * 60 * 1000;

let trips = 0;
let startedAt = 0;

/** Runs `task` (which opens another app's screen) with the auto lock grace in place. */
export async function whileAway<T>(task: () => Promise<T>): Promise<T> {
  trips += 1;
  startedAt = Date.now();
  try {
    return await task();
  } finally {
    trips -= 1;
  }
}

/**
 * Extra time the auto lock allows for the step away starting now. A trip that never came back
 * (a picker that never answers, on a phone short of memory) stops counting after the grace.
 */
export function awayGraceMs(now: number = Date.now()): number {
  return trips > 0 && now - startedAt < AWAY_GRACE_MS ? AWAY_GRACE_MS : 0;
}
