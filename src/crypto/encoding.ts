import { base64, base64urlnopad, hex, utf8 } from '@scure/base';

/** Standard padded base64, the form stored in JSON and database text columns. */
export const toBase64 = (bytes: Uint8Array): string => base64.encode(bytes);
export const fromBase64 = (text: string): Uint8Array => base64.decode(text);

/** Unpadded base64url, used for the auth secret sent to Supabase. */
export const toBase64Url = (bytes: Uint8Array): string => base64urlnopad.encode(bytes);
export const fromBase64Url = (text: string): Uint8Array => base64urlnopad.decode(text);

export const toHex = (bytes: Uint8Array): string => hex.encode(bytes);
export const fromHex = (text: string): Uint8Array => hex.decode(text);

export const utf8ToBytes = (text: string): Uint8Array => utf8.decode(text);
export const bytesToUtf8 = (bytes: Uint8Array): string => utf8.encode(bytes);

/** Accepts a string (encoded as UTF 8) or bytes; every salt, info and AAD goes through this. */
export function asBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? utf8ToBytes(value) : value;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** 32 bit unsigned integer, big endian. */
export function u32be(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError('u32be: value out of range');
  }
  const out = new Uint8Array(4);
  out[0] = (value >>> 24) & 0xff;
  out[1] = (value >>> 16) & 0xff;
  out[2] = (value >>> 8) & 0xff;
  out[3] = value & 0xff;
  return out;
}

export function readU32be(bytes: Uint8Array, offset: number): number {
  const b0 = bytes[offset] ?? 0;
  const b1 = bytes[offset + 1] ?? 0;
  const b2 = bytes[offset + 2] ?? 0;
  const b3 = bytes[offset + 3] ?? 0;
  return ((b0 << 24) >>> 0) + (b1 << 16) + (b2 << 8) + b3;
}

/** Constant time comparison so a verifier check never leaks where two values differ. */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Overwrites key bytes once they are no longer needed. */
export function zero(bytes: Uint8Array): void {
  bytes.fill(0);
}
