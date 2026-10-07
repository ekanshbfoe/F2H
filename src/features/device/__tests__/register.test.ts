// covers: AC-6 (registration payload, token handling, pending_exists reuse)
import { FunctionError } from '@/services/functions';
import { buildDevicePayload, ensureDeviceIdentity, registerDevice } from '../register';

const mockStore = new Map<string, string>();
const mockCall = jest.fn<Promise<unknown>, [string, Record<string, unknown>]>();
const mockSetToken = jest.fn(async (_token: string | null) => undefined);

jest.mock('@/services/secure-store', () => ({
  SecureKeys: {
    deviceToken: 'f2h.device_token',
    deviceId: 'f2h.device_id',
    deviceKey: 'f2h.device_key',
    registrationNonce: 'f2h.registration_nonce',
  },
  secureGet: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  secureSet: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
}));
jest.mock('@/services/functions', () => {
  class FunctionError extends Error {
    status: number;
    code: string;
    payload: Record<string, unknown> | null;
    constructor(s: number, c: string, p: Record<string, unknown> | null = null) {
      super(c);
      this.status = s;
      this.code = c;
      this.payload = p;
    }
  }
  return {
    callFunction: (...args: [string, Record<string, unknown>]) => mockCall(...args),
    FunctionError,
  };
});
jest.mock('@/services/push', () => ({
  getPushToken: jest.fn(async () => 'ExponentPushToken[test]'),
}));
jest.mock('@/services/device-info', () => ({
  getDeviceInfo: () => ({
    model: 'Pixel 4a',
    os: 'Android 13',
    app_version: '0.1.0',
    name: 'My Pixel',
  }),
}));
jest.mock('@/services/supabase', () => ({ setDeviceToken: (t: string | null) => mockSetToken(t) }));

beforeEach(() => {
  mockStore.clear();
  mockCall.mockReset();
  mockSetToken.mockClear();
});

describe('device identity', () => {
  it('creates a keypair and nonce once and reuses them', async () => {
    const a = await ensureDeviceIdentity();
    const b = await ensureDeviceIdentity();
    expect(a).toEqual(b);
    expect(a.pubkey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(a.nonce).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockStore.get('f2h.device_key')).toBeDefined();
  });

  it('builds the payload from device info, identity and the push token', async () => {
    const { device, nonce } = await buildDevicePayload();
    expect(device).toMatchObject({
      model: 'Pixel 4a',
      os: 'Android 13',
      app_version: '0.1.0',
      push_token: 'ExponentPushToken[test]',
    });
    expect(nonce).toBe(mockStore.get('f2h.registration_nonce'));
  });
});

describe('registerDevice', () => {
  it('stores the token and the id on success', async () => {
    mockCall.mockResolvedValue({ device_id: 'dev-1', device_token: 'dG9r', status: 'pending' });
    await expect(registerDevice()).resolves.toEqual({ deviceId: 'dev-1', status: 'pending' });
    expect(mockSetToken).toHaveBeenCalledWith('dG9r');
    expect(mockStore.get('f2h.device_id')).toBe('dev-1');
    expect(mockCall.mock.calls[0]?.[0]).toBe('register-device');
  });

  it('reuses the existing request on 409 pending_exists without touching the token', async () => {
    mockCall.mockRejectedValue(new FunctionError(409, 'pending_exists', { device_id: 'dev-old' }));
    await expect(registerDevice()).resolves.toEqual({ deviceId: 'dev-old', status: 'pending' });
    expect(mockSetToken).not.toHaveBeenCalled();
    expect(mockStore.get('f2h.device_id')).toBe('dev-old');
  });

  it('rethrows other function errors', async () => {
    mockCall.mockRejectedValue(new FunctionError(401, 'unauthenticated'));
    await expect(registerDevice()).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
