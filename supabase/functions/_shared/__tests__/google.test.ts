// covers: AC-1 of child spec 0001-drive-redundancy (signed OAuth state, return URL allow list,
// consent URL shape, refused refresh token marks the slot for relinking)
import {
  accessToken,
  authUrl,
  blobHex,
  GoogleAuthError,
  isAllowedReturnUrl,
  signState,
  verifyState,
  type LinkState,
} from '../google.ts';

const deno = { env: { get: jest.fn() } };
const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();

beforeAll(() => {
  (globalThis as unknown as { Deno: unknown }).Deno = deno;
});
afterAll(() => {
  delete (globalThis as unknown as { Deno?: unknown }).Deno;
});
beforeEach(() => {
  deno.env.get.mockImplementation(
    (n: string) =>
      ({
        GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'shh',
        SUPABASE_URL: 'https://x.supabase.co',
        DRIVE_STATE_SECRET: 'state-secret',
      })[n],
  );
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

const state: LinkState = {
  slot: 'b',
  admin: 'u-admin',
  return_url: 'exp://192.168.1.4:8081/--/drive-linked',
  nonce: 'n1',
  exp: Date.now() + 60_000,
};

describe('OAuth state', () => {
  it('round trips a signed state', async () => {
    const token = await signState(state);
    await expect(verifyState(token)).resolves.toEqual(state);
  });

  it('refuses a tampered, a foreign or an expired state', async () => {
    const token = await signState(state);
    const [body, mac] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...state, slot: 'a' })).toString('base64url');
    await expect(verifyState(`${forged}.${mac}`)).rejects.toMatchObject({ code: 'bad_state' });
    await expect(verifyState(token, 'other-secret')).rejects.toMatchObject({ code: 'bad_state' });
    await expect(
      verifyState(await signState({ ...state, exp: Date.now() - 1 })),
    ).rejects.toMatchObject({
      code: 'bad_state',
    });
    await expect(verifyState(`${body}`)).rejects.toMatchObject({ code: 'bad_state' });
  });
});

describe('links', () => {
  it('only lets the app deep links receive the user', () => {
    expect(isAllowedReturnUrl('exp://192.168.1.4:8081/--/drive-linked')).toBe(true);
    expect(isAllowedReturnUrl('f2h://drive-linked')).toBe(true);
    expect(isAllowedReturnUrl('https://evil.example/steal')).toBe(false);
    expect(isAllowedReturnUrl('javascript:alert(1)')).toBe(false);
  });

  it('asks for offline access to drive.file only, with the callback redirect', () => {
    const u = new URL(authUrl('st'));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('redirect_uri')).toBe(
      'https://x.supabase.co/functions/v1/drive-link-callback',
    );
    expect(u.searchParams.get('state')).toBe('st');
  });

  it('reads bytea ids as hex', () => {
    expect(blobHex('\\xabcd')).toBe('abcd');
    expect(blobHex(new Uint8Array([1, 255]))).toBe('01ff');
  });
});

describe('accessToken', () => {
  it('marks the slot for relinking when Google refuses the refresh token (AC-2)', async () => {
    const rpc = jest.fn(async (name: string) =>
      name === 'drive_refresh_token'
        ? { data: 'old-refresh', error: null }
        : { data: false, error: null },
    );
    const db = { rpc, from: jest.fn() } as never;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
    );
    await expect(accessToken(db, 'a')).rejects.toBeInstanceOf(GoogleAuthError);
    expect(rpc).toHaveBeenCalledWith('drive_mark_relink', { p_slot: 'a' });
  });

  it('returns and caches a fresh access token', async () => {
    const rpc = jest.fn(async () => ({ data: 'refresh', error: null }));
    const db = { rpc } as never;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'ya29.x', expires_in: 3600 }), { status: 200 }),
    );
    await expect(accessToken(db, 'b')).resolves.toBe('ya29.x');
    await expect(accessToken(db, 'b')).resolves.toBe('ya29.x');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
