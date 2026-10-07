// covers: AC-8 (geoLookup and the caller IP the approval sheet shows)
import { clientIp, geoLookup } from '../geo.ts';

const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe('clientIp', () => {
  it('takes the first address of x-forwarded-for', () => {
    const req = new Request('https://x.test', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.2' },
    });
    expect(clientIp(req)).toBe('203.0.113.9');
  });

  it('falls back to x-real-ip, then null', () => {
    expect(
      clientIp(new Request('https://x.test', { headers: { 'x-real-ip': '198.51.100.4' } })),
    ).toBe('198.51.100.4');
    expect(clientIp(new Request('https://x.test'))).toBeNull();
    expect(
      clientIp(new Request('https://x.test', { headers: { 'x-forwarded-for': ' ' } })),
    ).toBeNull();
  });
});

describe('geoLookup', () => {
  it('returns null for a missing or private address without calling the network', async () => {
    for (const ip of [null, '127.0.0.1', '::1', '10.1.2.3', '192.168.0.5', '172.16.9.9']) {
      await expect(geoLookup(ip)).resolves.toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a successful lookup to city, region, country and code', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          city: 'Delhi',
          region: 'Delhi',
          country: 'India',
          country_code: 'IN',
        }),
        { status: 200 },
      ),
    );
    await expect(geoLookup('203.0.113.9')).resolves.toEqual({
      ip: '203.0.113.9',
      city: 'Delhi',
      region: 'Delhi',
      country: 'India',
      country_code: 'IN',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://ipwho.is/203.0.113.9');
  });

  it('fills missing fields with null when the provider omits them', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await expect(geoLookup('203.0.113.9')).resolves.toEqual({
      ip: '203.0.113.9',
      city: null,
      region: null,
      country: null,
      country_code: null,
    });
  });

  it('returns null on a provider failure, a non 2xx status or a network error', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false }), { status: 200 }),
    );
    await expect(geoLookup('203.0.113.9')).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 503 }));
    await expect(geoLookup('203.0.113.9')).resolves.toBeNull();
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(geoLookup('203.0.113.9')).resolves.toBeNull();
  });

  it('gives up after the timeout instead of hanging a registration', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const pending = geoLookup('203.0.113.9');
    jest.advanceTimersByTime(3100);
    await expect(pending).resolves.toBeNull();
    jest.useRealTimers();
  });
});
