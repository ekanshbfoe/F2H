/**
 * Random source guard. Expo SDK 57 already exposes `globalThis.crypto.getRandomValues`
 * (and Node does too), so this normally does nothing. On a runtime that lacks it, the
 * `expo-crypto` implementation is installed so every `@noble/*` call below finds a
 * cryptographically secure source. Import this file before any `@noble` import.
 */
import * as ExpoCrypto from 'expo-crypto';

type TypedArray = Parameters<typeof ExpoCrypto.getRandomValues>[0];
type RandomSource = { getRandomValues: <T extends TypedArray>(array: T) => T };

const scope = globalThis as unknown as { crypto?: Partial<RandomSource> };

if (typeof scope.crypto?.getRandomValues !== 'function') {
  const getRandomValues = <T extends TypedArray>(array: T): T => ExpoCrypto.getRandomValues(array);
  if (scope.crypto) {
    scope.crypto.getRandomValues = getRandomValues;
  } else {
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues },
      configurable: true,
      writable: true,
    });
  }
}

/** True once a secure random source is reachable as `globalThis.crypto.getRandomValues`. */
export const randomSourceReady = typeof scope.crypto?.getRandomValues === 'function';
