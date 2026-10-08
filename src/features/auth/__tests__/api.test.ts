// covers: AC-12 (unwrap after approval, nothing before), AC-15 (grant redeem), AC-16 (change password
import { box, envelope, fromBase64, passwordSplitSync, toBase64, verifier } from '@/crypto';
import { FunctionError } from '@/services/functions';
import { useSession } from '@/state/session.store';
import { changePassword, redeemGrant, signIn, signOut } from '../api';

// rewraps under the new KEK and leaves the Admin wrap alone), plus the error mapping the banner shows.

type Row = Record<string, unknown>;
const mockTables: Record<string, Row[]> = {};
const mockFailNextUpdate: { table: string | null } = { table: null };
const mockUpdates: { table: string; values: Row; filters: [string, unknown][] }[] = [];
const mockAuth = {
  signInWithPassword: jest.fn(),
  updateUser: jest.fn(),
  getUser: jest.fn(),
  getSession: jest.fn(),
  signOut: jest.fn(async () => ({ error: null })),
};
const mockRpc = jest.fn();
const mockCall = jest.fn();
const mockRegister = jest.fn();
const mockDeviceSecret = jest.fn();
const mockStore = new Map<string, string>();

jest.mock('@/services/supabase', () => ({
  supabase: {
    get auth() {
      return mockAuth;
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const rows = () =>
        (mockTables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: (c: string, v: unknown) => {
          filters.push([c, v]);
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        update: (values: Row) => {
          const u = { table, values, filters };
          mockUpdates.push(u);
          const upd = {
            eq: (c: string, v: unknown) => {
              filters.push([c, v]);
              return upd;
            },
            then: (resolve: (v: { error: { message: string } | null }) => void) => {
              if (mockFailNextUpdate.table === table) {
                mockFailNextUpdate.table = null;
                resolve({ error: { message: 'rls denied' } });
              } else resolve({ error: null });
            },
          };
          return upd;
        },
      });
      return chain;
    },
  },
  setDeviceToken: jest.fn(async () => undefined),
  loadDeviceToken: jest.fn(async () => mockStore.get('f2h.device_token') ?? null),
  getDeviceToken: () => mockStore.get('f2h.device_token') ?? null,
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
  return { callFunction: (...a: unknown[]) => mockCall(...a), FunctionError };
});
jest.mock('@/features/device/register', () => ({
  registerDevice: () => mockRegister(),
  buildDevicePayload: async () => ({ device: { model: 'Pixel' }, nonce: 'n' }),
  deviceSecretKey: () => mockDeviceSecret(),
}));
jest.mock('@/services/secure-store', () => ({
  SecureKeys: { deviceId: 'f2h.device_id', deviceToken: 'f2h.device_token' },
  secureGet: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  secureSet: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
  secureWipe: jest.fn(async () => mockStore.clear()),
  secureDelete: jest.fn(async (k: string) => {
    mockStore.delete(k);
  }),
}));

const EMAIL = 'father@example.com';
const PASSWORD = 'correct horse battery';
const USER = { id: '11111111-1111-4111-8111-111111111111', email: EMAIL };
const profile = {
  id: USER.id,
  email: EMAIL,
  display_name: 'Father',
  role: 'member',
  status: 'active',
};

function seedKeyMaterial(mk: Uint8Array, kek: Uint8Array) {
  mockTables.key_material = [
    {
      user_id: USER.id,
      mk_wrapped_pw: toBase64(envelope.wrapMk(kek, mk, USER.id)),
      mk_verifier: toBase64(verifier.make(mk, USER.id)),
    },
  ];
}

beforeEach(() => {
  for (const k of Object.keys(mockTables)) delete mockTables[k];
  mockUpdates.length = 0;
  mockFailNextUpdate.table = null;
  mockStore.clear();
  jest.clearAllMocks();
  useSession.getState().reset('signed_out');
  mockTables.profiles = [profile];
  mockTables.family_config = [{ id: 1, admin_recovery_pubkey: 'set' }];
  mockAuth.signInWithPassword.mockResolvedValue({ data: { user: USER }, error: null });
});

describe('signIn', () => {
  it('sends the auth half of the split, never the password, and unwraps after an approved registration (AC-12)', async () => {
    const split = passwordSplitSync(EMAIL, PASSWORD);
    const mk = envelope.generateMasterKey();
    seedKeyMaterial(mk, split.kek);
    mockRegister.mockResolvedValue({ deviceId: 'dev-1', status: 'approved' });

    await expect(signIn({ email: EMAIL, password: PASSWORD })).resolves.toBe('home');
    const sent = mockAuth.signInWithPassword.mock.calls[0]?.[0] as { password: string };
    expect(sent.password).toBe(split.authSecret);
    expect(sent.password).not.toBe(PASSWORD);
    const s = useSession.getState();
    expect(s.phase).toBe('ready');
    expect(s.mk).toEqual(mk);
    expect(s.kek).toBeNull();
  });

  it('resumes an already approved phone on a cold start without registering again', async () => {
    const split = passwordSplitSync(EMAIL, PASSWORD);
    const mk = envelope.generateMasterKey();
    seedKeyMaterial(mk, split.kek);
    mockStore.set('f2h.device_id', 'dev-1');
    mockStore.set('f2h.device_token', 'dG9r');
    mockTables.devices = [{ id: 'dev-1', status: 'approved' }];
    await expect(signIn({ email: EMAIL, password: PASSWORD })).resolves.toBe('home');
    expect(mockRegister).not.toHaveBeenCalled();
    expect(useSession.getState().deviceId).toBe('dev-1');
  });

  it('keeps the device identity on a transient status lookup failure', async () => {
    mockStore.set('f2h.device_id', 'dev-1');
    mockStore.set('f2h.device_token', 'dG9r');
    mockTables.devices = []; // row not visible right now
    mockRegister.mockResolvedValue({ deviceId: 'dev-1', status: 'approved' });
    const split = passwordSplitSync(EMAIL, PASSWORD);
    seedKeyMaterial(envelope.generateMasterKey(), split.kek);
    await signIn({ email: EMAIL, password: PASSWORD });
    expect(mockStore.get('f2h.device_id')).toBe('dev-1');
    expect(mockStore.get('f2h.device_token')).toBe('dG9r');
  });

  it('sign out keeps the device token, id and nonce for the next login', async () => {
    mockStore.set('f2h.device_id', 'dev-1');
    mockStore.set('f2h.device_token', 'dG9r');
    mockStore.set('f2h.registration_nonce', 'n-1');
    useSession.getState().setMk(envelope.generateMasterKey());
    await signOut();
    expect(mockStore.get('f2h.device_id')).toBe('dev-1');
    expect(mockStore.get('f2h.device_token')).toBe('dG9r');
    expect(mockStore.get('f2h.registration_nonce')).toBe('n-1');
    expect(useSession.getState().mk).toBeNull();
    expect(useSession.getState().phase).toBe('signed_out');
  });

  it('forgets a closed device and registers afresh', async () => {
    mockStore.set('f2h.device_id', 'dev-old');
    mockStore.set('f2h.device_token', 'dG9r');
    mockTables.devices = [{ id: 'dev-old', status: 'revoked' }];
    mockRegister.mockResolvedValue({ deviceId: 'dev-new', status: 'pending' });
    await expect(signIn({ email: EMAIL, password: PASSWORD })).resolves.toBe('waiting');
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockStore.has('f2h.device_id')).toBe(false);
  });

  it('keeps the KEK in memory and waits when the device is pending (AC-12 before approval)', async () => {
    mockRegister.mockResolvedValue({ deviceId: 'dev-1', status: 'pending' });
    await expect(signIn({ email: EMAIL, password: PASSWORD })).resolves.toBe('waiting');
    const s = useSession.getState();
    expect(s.phase).toBe('pending');
    expect(s.kek).toHaveLength(32);
    expect(s.mk).toBeNull();
  });

  it('refuses a wrong password wrap with verifier_failed instead of handing out a wrong key', async () => {
    const other = passwordSplitSync(EMAIL, 'a different passphrase');
    seedKeyMaterial(envelope.generateMasterKey(), other.kek);
    mockRegister.mockResolvedValue({ deviceId: 'dev-1', status: 'approved' });
    await expect(signIn({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: 'bad_wrap',
    });
    expect(useSession.getState().mk).toBeNull();
  });

  it('maps auth failures: 400 is bad credentials, anything else names Supabase Auth and the status', async () => {
    mockAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 400, message: 'Invalid login credentials' },
    });
    await expect(signIn({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: 'bad_credentials',
    });
    mockAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 422, message: 'Email logins are disabled' },
    });
    await expect(signIn({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: 'auth_unreachable',
      message: 'Supabase Auth signInWithPassword: status 422, Email logins are disabled',
    });
  });

  it('names the function and HTTP status when registration fails, and zeroes the KEK', async () => {
    mockRegister.mockRejectedValueOnce(new FunctionError(500, 'register_failed'));
    await expect(signIn({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: 'function_failed',
      message: 'register-device: register_failed (HTTP 500)',
    });
    mockRegister.mockRejectedValueOnce(new FunctionError(0, 'network'));
    await expect(signIn({ email: EMAIL, password: PASSWORD })).rejects.toMatchObject({
      code: 'network',
      message: 'register-device: network (no HTTP response)',
    });
    expect(useSession.getState().kek).toBeNull();
  });
});

describe('changePassword (AC-16)', () => {
  it('verifies the current password, updates auth and rewraps the MK under the new KEK only', async () => {
    const mk = envelope.generateMasterKey();
    const s = useSession.getState();
    s.setProfile(profile as never);
    s.setMk(mk);
    s.setDevice('dev-1', 'approved');
    mockAuth.updateUser.mockResolvedValue({ error: null });

    await changePassword(PASSWORD, 'a brand new passphrase');

    const next = passwordSplitSync(EMAIL, 'a brand new passphrase');
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: next.authSecret });
    const update = mockUpdates.find((u) => u.table === 'key_material');
    expect(update?.values).not.toHaveProperty('mk_wrapped_admin');
    const rewrapped = fromBase64(String(update?.values.mk_wrapped_pw));
    expect(envelope.unwrapMk(next.kek, rewrapped, USER.id)).toEqual(mk);
    expect(update?.filters).toEqual([['user_id', USER.id]]);
  });

  it('rolls the auth password back when the new wrap cannot be written', async () => {
    const mk = envelope.generateMasterKey();
    const s = useSession.getState();
    s.setProfile(profile as never);
    s.setMk(mk);
    mockAuth.updateUser.mockResolvedValue({ error: null });
    mockFailNextUpdate.table = 'key_material';
    await expect(changePassword(PASSWORD, 'a brand new passphrase')).rejects.toMatchObject({
      message: expect.stringContaining('password unchanged'),
    });
    const current = passwordSplitSync(EMAIL, PASSWORD);
    expect(mockAuth.updateUser).toHaveBeenLastCalledWith({ password: current.authSecret });
  });

  it('refuses when the current password is wrong and touches nothing', async () => {
    const s = useSession.getState();
    s.setProfile(profile as never);
    s.setMk(envelope.generateMasterKey());
    mockAuth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 400, message: 'Invalid login credentials' },
    });
    await expect(changePassword('wrong', 'a brand new passphrase')).rejects.toMatchObject({
      code: 'bad_credentials',
    });
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
    expect(mockUpdates).toHaveLength(0);
  });
});

describe('redeemGrant (AC-15)', () => {
  it('unseals the MK with the device key, rewraps it under the new password and calls reset-password', async () => {
    const device = box.generateKeypair();
    const mk = envelope.generateMasterKey();
    mockDeviceSecret.mockResolvedValue(device.secretKey.slice());
    mockAuth.getUser.mockResolvedValue({ data: { user: USER } });
    mockCall.mockResolvedValue({ ok: true });
    mockTables.key_material = [
      { user_id: USER.id, mk_verifier: toBase64(verifier.make(mk, USER.id)) },
    ];
    const grant = {
      id: '22222222-2222-4222-8222-222222222222',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      mk_sealed_for_device: toBase64(box.seal(device.publicKey, mk)),
    };

    await expect(redeemGrant(grant, 'my replacement passphrase')).resolves.toBe('home');

    const [name, body] = mockCall.mock.calls[0] as [string, Record<string, string>];
    const next = passwordSplitSync(EMAIL, 'my replacement passphrase');
    expect(name).toBe('reset-password');
    expect(body.grant_id).toBe(grant.id);
    expect(body.new_auth_secret).toBe(next.authSecret);
    expect(
      envelope.unwrapMk(next.kek, fromBase64(String(body.new_mk_wrapped_pw)), USER.id),
    ).toEqual(mk);
    expect(useSession.getState().mk).toEqual(mk);
  });

  it('fails closed when the grant was sealed to another device', async () => {
    const device = box.generateKeypair();
    const other = box.generateKeypair();
    mockDeviceSecret.mockResolvedValue(device.secretKey.slice());
    mockAuth.getUser.mockResolvedValue({ data: { user: USER } });
    mockTables.key_material = [
      {
        user_id: USER.id,
        mk_verifier: toBase64(verifier.make(envelope.generateMasterKey(), USER.id)),
      },
    ];
    const grant = {
      id: '22222222-2222-4222-8222-222222222222',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      mk_sealed_for_device: toBase64(box.seal(other.publicKey, envelope.generateMasterKey())),
    };
    await expect(redeemGrant(grant, 'my replacement passphrase')).rejects.toThrow();
    expect(mockCall).not.toHaveBeenCalled();
  });
});
