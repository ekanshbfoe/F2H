import { fromHex, toHex, utf8ToBytes } from '../encoding';
import raw from './vectors.json';

export const vectors = raw;
export const hex = toHex;
export const bytes = fromHex;
export const utf8 = utf8ToBytes;

/** `len` bytes counting up from `start`, the same generator the vector script uses. */
export const seq = (len: number, start = 0): Uint8Array =>
  Uint8Array.from({ length: len }, (_, i) => (start + i) & 255);

export function flipBit(input: Uint8Array, index: number): Uint8Array {
  const out = input.slice();
  out[index] = (out[index] ?? 0) ^ 0x01;
  return out;
}

/** Strict index access for vector lists (noUncheckedIndexedAccess). */
export function pick<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`no vector at index ${index}`);
  return value;
}
