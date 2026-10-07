// covers: AC-8 (sendPush never throws and only sends to real Expo tokens)
import { sendPush } from '../push.ts';

const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

beforeEach(() => {
  fetchMock.mockReset();
  errorSpy.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => errorSpy.mockRestore());

const message = {
  title: 'Approval needed',
  body: 'Brother wants to sign in',
  data: { deviceId: 'd1' },
};

describe('sendPush', () => {
  it('skips empty, null and non Expo tokens and sends nothing when none remain', async () => {
    await expect(sendPush([null, undefined, '', 'fcm-token-123'], message)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts one message per Expo token to the Expo push API and returns the tickets', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { status: 'ok', id: 't1' },
            { status: 'ok', id: 't2' },
          ],
        }),
        {
          status: 200,
        },
      ),
    );
    const tickets = await sendPush(
      ['ExponentPushToken[aaa]', 'bad', 'ExponentPushToken[bbb]'],
      message,
    );
    expect(tickets).toEqual([
      { status: 'ok', id: 't1' },
      { status: 'ok', id: 't2' },
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://exp.host/--/api/v2/push/send');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body)) as { to: string; title: string; data: unknown }[];
    expect(body.map((m) => m.to)).toEqual(['ExponentPushToken[aaa]', 'ExponentPushToken[bbb]']);
    expect(body[0]).toMatchObject({ title: 'Approval needed', data: { deviceId: 'd1' } });
  });

  it('returns an empty list on a non 2xx response or a network error instead of throwing', async () => {
    fetchMock.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    await expect(sendPush(['ExponentPushToken[aaa]'], message)).resolves.toEqual([]);
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(sendPush(['ExponentPushToken[aaa]'], message)).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('returns an empty list when the API answers without a data array', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await expect(sendPush(['ExponentPushToken[aaa]'], message)).resolves.toEqual([]);
  });
});
