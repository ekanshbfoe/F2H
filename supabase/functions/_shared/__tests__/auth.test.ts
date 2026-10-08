// covers: AC-8 (requireApprovedDevice, requireAdmin, requireServiceCall gate every function)
import {
  findDevice,
  requireAdmin,
  requireApprovedDevice,
  requirePendingAdmin,
  requireServiceCall,
  requireUser,
} from '../auth.ts';
import { serviceClient, userClient } from '../supabase.ts';

jest.mock('../supabase.ts', () => ({ serviceClient: jest.fn(), userClient: jest.fn() }));

const serviceClientMock = serviceClient as jest.Mock;
const userClientMock = userClient as jest.Mock;

const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.com' };
// 32 bytes of 0x01, base64; sha256 hex of those bytes is what the devices row stores.
const TOKEN = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=';
const TOKEN_HASH = '72cd6e8422c407fb6d098690f1130b7ded7ec2f7f5e1d30bd9d521f015363793';

type Rows = {
  devices?: Record<string, unknown> | null;
  profiles?: Record<string, unknown> | null;
  family_config?: Record<string, unknown> | null;
};

/** A tiny stand in for the PostgREST query builder: every filter returns itself, maybeSingle yields the row. */
function fakeDb(rows: Rows) {
  const filters: Record<string, [string, unknown][]> = {};
  const from = jest.fn((table: keyof Rows) => {
    const chain = {
      select: jest.fn(() => chain),
      eq: jest.fn((col: string, val: unknown) => {
        (filters[table] ??= []).push([col, val]);
        return chain;
      }),
      maybeSingle: jest.fn(async () => ({ data: rows[table] ?? null, error: null })),
    };
    return chain;
  });
  return { from, filters };
}

function request(headers: Record<string, string> = {}) {
  return new Request('https://x.test/fn', { headers });
}

beforeEach(() => {
  serviceClientMock.mockReset();
  userClientMock.mockReset();
  userClientMock.mockReturnValue({
    auth: { getUser: jest.fn(async () => ({ data: { user: USER }, error: null })) },
  });
});

describe('requireUser', () => {
  it('returns the user behind a valid JWT', async () => {
    await expect(requireUser(request({ Authorization: 'Bearer jwt' }))).resolves.toEqual(USER);
  });

  it('throws 401 unauthenticated when the JWT is missing or rejected', async () => {
    userClientMock.mockReturnValue({
      auth: {
        getUser: jest.fn(async () => ({ data: { user: null }, error: { message: 'bad jwt' } })),
      },
    });
    await expect(requireUser(request())).rejects.toMatchObject({
      status: 401,
      code: 'unauthenticated',
    });
  });
});

describe('findDevice', () => {
  it('returns null without a device header and never queries', async () => {
    const db = fakeDb({});
    serviceClientMock.mockReturnValue(db);
    await expect(findDevice(USER.id, request())).resolves.toBeNull();
    expect(db.from).not.toHaveBeenCalled();
  });

  it('looks the device up by user id and the sha256 of the decoded token', async () => {
    const device = { id: 'd1', user_id: USER.id, status: 'approved', push_token: null };
    const db = fakeDb({ devices: device });
    serviceClientMock.mockReturnValue(db);
    await expect(findDevice(USER.id, request({ 'x-f2h-device': TOKEN }))).resolves.toEqual(device);
    expect(db.filters.devices).toEqual([
      ['user_id', USER.id],
      ['token_hash', TOKEN_HASH],
    ]);
  });

  it('rejects a header that is not base64 with 400 bad_device_header', async () => {
    serviceClientMock.mockReturnValue(fakeDb({}));
    await expect(findDevice(USER.id, request({ 'x-f2h-device': '***' }))).rejects.toMatchObject({
      status: 400,
      code: 'bad_device_header',
    });
  });
});

describe('requireApprovedDevice', () => {
  it('returns the user and device for an approved device with an active profile', async () => {
    const device = {
      id: 'd1',
      user_id: USER.id,
      status: 'approved',
      push_token: 'ExponentPushToken[x]',
    };
    serviceClientMock.mockReturnValue(fakeDb({ devices: device, profiles: { status: 'active' } }));
    await expect(requireApprovedDevice(request({ 'x-f2h-device': TOKEN }))).resolves.toEqual({
      user: USER,
      device,
    });
  });

  it.each([
    ['no header', {}, null, { status: 'active' }],
    [
      'pending device',
      { 'x-f2h-device': TOKEN },
      { id: 'd1', user_id: USER.id, status: 'pending', push_token: null },
      { status: 'active' },
    ],
    [
      'revoked device',
      { 'x-f2h-device': TOKEN },
      { id: 'd1', user_id: USER.id, status: 'revoked', push_token: null },
      { status: 'active' },
    ],
    ['unknown token', { 'x-f2h-device': TOKEN }, null, { status: 'active' }],
  ])('throws 403 device_not_approved for %s', async (_name, headers, devices, profiles) => {
    serviceClientMock.mockReturnValue(fakeDb({ devices, profiles }));
    await expect(requireApprovedDevice(request(headers))).rejects.toMatchObject({
      status: 403,
      code: 'device_not_approved',
    });
  });

  it('throws 403 profile_not_active when the device is approved but the profile is pending', async () => {
    const device = { id: 'd1', user_id: USER.id, status: 'approved', push_token: null };
    serviceClientMock.mockReturnValue(fakeDb({ devices: device, profiles: { status: 'pending' } }));
    await expect(requireApprovedDevice(request({ 'x-f2h-device': TOKEN }))).rejects.toMatchObject({
      status: 403,
      code: 'profile_not_active',
    });
  });
});

describe('requireAdmin', () => {
  const device = { id: 'd1', user_id: USER.id, status: 'approved', push_token: null };

  it('passes for an approved device whose profile is the admin', async () => {
    serviceClientMock.mockReturnValue(
      fakeDb({ devices: device, profiles: { status: 'active', role: 'admin' } }),
    );
    await expect(requireAdmin(request({ 'x-f2h-device': TOKEN }))).resolves.toMatchObject({
      user: USER,
    });
  });

  it('throws 403 admin_required for a plain member', async () => {
    serviceClientMock.mockReturnValue(
      fakeDb({ devices: device, profiles: { status: 'active', role: 'member' } }),
    );
    await expect(requireAdmin(request({ 'x-f2h-device': TOKEN }))).rejects.toMatchObject({
      status: 403,
      code: 'admin_required',
    });
  });

  it('still refuses the admin from a device that is not approved', async () => {
    serviceClientMock.mockReturnValue(
      fakeDb({
        devices: { ...device, status: 'pending' },
        profiles: { status: 'active', role: 'admin' },
      }),
    );
    await expect(requireAdmin(request({ 'x-f2h-device': TOKEN }))).rejects.toMatchObject({
      code: 'device_not_approved',
    });
  });
});

describe('requirePendingAdmin (self approval, AC-2)', () => {
  const pendingDevice = { id: 'd1', user_id: USER.id, status: 'pending', push_token: null };
  const adminProfile = { status: 'active', role: 'admin' };
  const RECOVERY_PUB_HEX = '3cb8a0649a0c06a88d256332bf5e15bbc24a4d365ec3e9e49ba1994d69e0470a';
  const config = { admin_user_id: USER.id, admin_recovery_pubkey: `\\x${RECOVERY_PUB_HEX}` };

  it('passes for the Admin on their own pending phone and decodes the published key', async () => {
    serviceClientMock.mockReturnValue(
      fakeDb({ devices: pendingDevice, profiles: adminProfile, family_config: config }),
    );
    const caller = await requirePendingAdmin(request({ 'x-f2h-device': TOKEN }));
    expect(caller.device).toEqual(pendingDevice);
    expect(Array.from(caller.recoveryPub.slice(0, 2))).toEqual([0x3c, 0xb8]);
    expect(caller.recoveryPub).toHaveLength(32);
  });

  it('throws 403 admin_required for a member, even on a pending phone', async () => {
    serviceClientMock.mockReturnValue(
      fakeDb({
        devices: pendingDevice,
        profiles: { status: 'active', role: 'member' },
        family_config: config,
      }),
    );
    await expect(requirePendingAdmin(request({ 'x-f2h-device': TOKEN }))).rejects.toMatchObject({
      status: 403,
      code: 'admin_required',
    });
  });

  it('throws 403 device_not_pending from an approved phone or without a header', async () => {
    serviceClientMock.mockReturnValue(
      fakeDb({
        devices: { ...pendingDevice, status: 'approved' },
        profiles: adminProfile,
        family_config: config,
      }),
    );
    await expect(requirePendingAdmin(request({ 'x-f2h-device': TOKEN }))).rejects.toMatchObject({
      code: 'device_not_pending',
    });
    await expect(requirePendingAdmin(request())).rejects.toMatchObject({
      code: 'device_not_pending',
    });
  });

  it('throws 403 recovery_not_published before the first run', async () => {
    serviceClientMock.mockReturnValue(
      fakeDb({
        devices: pendingDevice,
        profiles: adminProfile,
        family_config: { admin_user_id: USER.id, admin_recovery_pubkey: null },
      }),
    );
    await expect(requirePendingAdmin(request({ 'x-f2h-device': TOKEN }))).rejects.toMatchObject({
      status: 403,
      code: 'recovery_not_published',
    });
  });
});

describe('requireServiceCall', () => {
  const deno = { env: { get: jest.fn() } };
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  beforeEach(() => {
    (globalThis as unknown as { Deno: unknown }).Deno = deno;
    deno.env.get.mockReset();
    deno.env.get.mockImplementation((name: string) =>
      name === 'SUPABASE_SERVICE_ROLE_KEY'
        ? 'legacy-jwt-key'
        : name === 'SUPABASE_URL'
          ? 'https://x.supabase.co'
          : undefined,
    );
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    delete (globalThis as unknown as { Deno?: unknown }).Deno;
  });

  it('accepts the legacy service role JWT as a bearer token without a probe', async () => {
    await expect(
      requireServiceCall(request({ Authorization: 'Bearer legacy-jwt-key' })),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts any other key only when the admin probe succeeds', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await expect(
      requireServiceCall(request({ Authorization: 'Bearer sb_secret_abc' })),
    ).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://x.supabase.co/auth/v1/admin/users?per_page=1');
    expect(new Headers(init?.headers).get('apikey')).toBe('sb_secret_abc');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(
      requireServiceCall(request({ Authorization: 'Bearer sb_secret_wrong' })),
    ).rejects.toMatchObject({ code: 'service_key_required' });
  });

  it('rejects a missing bearer without probing and an anon key that fails the probe', async () => {
    await expect(requireServiceCall(request())).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(
      requireServiceCall(request({ Authorization: 'Bearer anon-key' })),
    ).rejects.toMatchObject({ code: 'service_key_required' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
