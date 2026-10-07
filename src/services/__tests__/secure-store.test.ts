// covers: AC-9 (the SecureStore wrapper the device token and local wraps go through)
import { SecureKeys, secureDelete, secureGet, secureSet, secureWipe } from '../secure-store';

const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

beforeEach(() => mockStore.clear());

describe('secure store wrapper', () => {
  it('stores, reads and deletes a value under its namespaced key', async () => {
    await expect(secureGet(SecureKeys.deviceToken)).resolves.toBeNull();
    await secureSet(SecureKeys.deviceToken, 'dG9rZW4=');
    await expect(secureGet(SecureKeys.deviceToken)).resolves.toBe('dG9rZW4=');
    expect(mockStore.has('f2h.device_token')).toBe(true);
    await secureDelete(SecureKeys.deviceToken);
    await expect(secureGet(SecureKeys.deviceToken)).resolves.toBeNull();
  });

  it('every key is unique and prefixed with f2h.', () => {
    const keys = Object.values(SecureKeys);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => k.startsWith('f2h.'))).toBe(true);
  });

  it('secureWipe removes every F2H entry and leaves other apps keys alone', async () => {
    for (const key of Object.values(SecureKeys)) await secureSet(key, 'x');
    mockStore.set('other.app', 'keep');
    await secureWipe();
    for (const key of Object.values(SecureKeys)) await expect(secureGet(key)).resolves.toBeNull();
    expect(mockStore.get('other.app')).toBe('keep');
  });
});
