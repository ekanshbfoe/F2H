// covers: AC-8 (jsonError and the handler wrapper every Edge Function uses)
import { handle, HttpError, json, jsonError, readJson } from '../errors.ts';

describe('json and jsonError', () => {
  it('json returns the payload with a JSON content type and the given status', async () => {
    const res = json({ ok: true }, 201, { 'X-Test': '1' });
    expect(res.status).toBe(201);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('X-Test')).toBe('1');
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('jsonError wraps code and message under error, message defaults to the code', async () => {
    await expect(jsonError(403, 'device_not_approved').json()).resolves.toEqual({
      error: { code: 'device_not_approved', message: 'device_not_approved' },
    });
    const res = jsonError(400, 'bad_input', 'email is required');
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: { code: 'bad_input', message: 'email is required' },
    });
  });
});

describe('handle', () => {
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  afterEach(() => errorSpy.mockClear());
  afterAll(() => errorSpy.mockRestore());

  it('passes a successful response through untouched', async () => {
    const wrapped = handle(async () => json({ hello: 'world' }));
    const res = await wrapped(new Request('https://x.test/fn'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ hello: 'world' });
  });

  it('turns a thrown HttpError into its status and code', async () => {
    const wrapped = handle(async () => {
      throw new HttpError(401, 'unauthenticated');
    });
    const res = await wrapped(new Request('https://x.test/fn'));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: { code: 'unauthenticated', message: 'unauthenticated' },
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('turns any other error into a 500 without leaking its message', async () => {
    const wrapped = handle(async () => {
      throw new Error('secret db connection string leaked?');
    });
    const res = await wrapped(new Request('https://x.test/fn'));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('internal');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(errorSpy).toHaveBeenCalledWith('unhandled', 'secret db connection string leaked?');
  });
});

describe('readJson', () => {
  it('parses a JSON body', async () => {
    const req = new Request('https://x.test/fn', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
      headers: { 'Content-Type': 'application/json' },
    });
    await expect(readJson<{ a: number }>(req)).resolves.toEqual({ a: 1 });
  });

  it('rejects a malformed body with a 400 bad_json HttpError', async () => {
    const req = new Request('https://x.test/fn', { method: 'POST', body: '{not json' });
    await expect(readJson(req)).rejects.toMatchObject({ status: 400, code: 'bad_json' });
  });
});
