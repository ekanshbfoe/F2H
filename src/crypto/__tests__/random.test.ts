import { randomSourceReady } from '../polyfill';
import { randomBlobId, randomBytes, randomUuid } from '../random';

describe('random source (AC-1)', () => {
  it('exposes crypto.getRandomValues globally before any noble import', () => {
    expect(randomSourceReady).toBe(true);
    expect(typeof globalThis.crypto.getRandomValues).toBe('function');
  });

  it('randomBytes(n) returns n fresh bytes', () => {
    const a = randomBytes(32);
    const b = randomBytes(32);
    expect(a).toHaveLength(32);
    expect(a).not.toEqual(b);
    expect(randomBytes(0)).toHaveLength(0);
    expect(() => randomBytes(-1)).toThrow(RangeError);
  });

  it('randomUuid is a version 4 UUID and blob ids are 16 bytes', () => {
    expect(randomUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(randomUuid()).not.toEqual(randomUuid());
    expect(randomBlobId()).toHaveLength(16);
  });

  it('installs expo-crypto when the runtime has no crypto global', () => {
    const fill = jest.fn(<T extends Uint8Array>(arr: T): T => arr.fill(7));
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      jest.isolateModules(() => {
        jest.doMock('expo-crypto', () => ({ getRandomValues: fill }));
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('../random') as typeof import('../random');
        expect(mod.randomBytes(4)).toEqual(new Uint8Array([7, 7, 7, 7]));
        expect(fill).toHaveBeenCalledTimes(1);
      });
    } finally {
      if (saved) Object.defineProperty(globalThis, 'crypto', saved);
      jest.dontMock('expo-crypto');
    }
  });
});
