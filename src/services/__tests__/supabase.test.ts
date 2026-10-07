import type * as SupabaseService from '../supabase';

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

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

const fetchMock = jest.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
  Promise.resolve(new Response('[]', { status: 200 })),
);
globalThis.fetch = fetchMock as unknown as typeof fetch;

// Loaded after the env and fetch are in place, since the module reads both at import time.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const svc = require('../supabase') as typeof SupabaseService;

function lastCall(): [RequestInfo | URL, RequestInit | undefined] {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error('fetch was not called');
  return [call[0], call[1]];
}

function sentHeaders(): Headers {
  return new Headers(lastCall()[1]?.headers);
}

describe('supabase client with device header (AC-9)', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    mockStore.clear();
  });

  it('sends no device header before a token exists', async () => {
    await svc.setDeviceToken(null);
    await svc.fetchWithDeviceHeader('https://example.supabase.co/rest/v1/health', {
      method: 'POST',
    });
    expect(sentHeaders().get(svc.DEVICE_HEADER)).toBeNull();
  });

  it('sets the header once a token is set and persists it in SecureStore', async () => {
    await svc.setDeviceToken('dG9rZW4=');
    await svc.fetchWithDeviceHeader('https://example.supabase.co/rest/v1/profiles', {
      headers: { apikey: 'anon-key' },
    });
    const headers = sentHeaders();
    expect(headers.get(svc.DEVICE_HEADER)).toBe('dG9rZW4=');
    expect(headers.get('apikey')).toBe('anon-key');
    expect(mockStore.get('f2h.device_token')).toBe('dG9rZW4=');
  });

  it('reloads the persisted token at boot', async () => {
    await svc.setDeviceToken(null);
    mockStore.set('f2h.device_token', 'cGVyc2lzdGVk');
    expect(await svc.loadDeviceToken()).toBe('cGVyc2lzdGVk');
    expect(svc.getDeviceToken()).toBe('cGVyc2lzdGVk');
  });

  it('routes the real client through the header fetch', async () => {
    await svc.setDeviceToken('dG9rZW4=');
    await svc.supabase.rpc('health');
    expect(sentHeaders().get(svc.DEVICE_HEADER)).toBe('dG9rZW4=');
    expect(String(lastCall()[0])).toContain('/rest/v1/rpc/health');
  });
});
