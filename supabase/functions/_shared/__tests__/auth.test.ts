// covers: AC-8 (requireApprovedDevice, requireAdmin, requireServiceCall gate every function)
import {
  findDevice,
  requireAdmin,
  requireApprovedDevice,
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

type Rows = { devices?: Record<string, unknown> | null; profiles?: Record<string, unknown> | null };

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

describe('requireServiceCall', () => {
  const deno = { env: { get: jest.fn() } };
  beforeEach(() => {
    (globalThis as unknown as { Deno: unknown }).Deno = deno;
    deno.env.get.mockReset();
  });
  afterAll(() => {
    delete (globalThis as unknown as { Deno?: unknown }).Deno;
  });

  it('accepts the service role key as a bearer token', () => {
    deno.env.get.mockReturnValue('service-key');
    expect(() =>
      requireServiceCall(request({ Authorization: 'Bearer service-key' })),
    ).not.toThrow();
  });

  it('rejects a missing, wrong or anon bearer, and fails closed when the env is unset', () => {
    deno.env.get.mockReturnValue('service-key');
    expect(() => requireServiceCall(request())).toThrow(expect.objectContaining({ status: 401 }));
    expect(() => requireServiceCall(request({ Authorization: 'Bearer anon-key' }))).toThrow(
      expect.objectContaining({ code: 'service_key_required' }),
    );
    deno.env.get.mockReturnValue(undefined);
    expect(() => requireServiceCall(request({ Authorization: 'Bearer ' }))).toThrow(
      expect.objectContaining({ code: 'service_key_required' }),
    );
  });
});
