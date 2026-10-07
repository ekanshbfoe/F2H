// covers: AC-3 and AC-6 (device input validation, a token returned once with only its hash stored,
import { buildDeviceRow, parseDeviceInput, rotateToken } from '../device.ts';
import { base64ToBytes, sha256Hex } from '../hash.ts';

// IP and geo from the request)

const PUB = Buffer.alloc(32, 7).toString('base64');

describe('parseDeviceInput', () => {
  it('normalizes a complete payload and caps field lengths', () => {
    const d = parseDeviceInput({
      model: 'LAVA LXX503',
      os: 'Android 14',
      app_version: '0.1.0',
      pubkey: PUB,
      push_token: '',
      nonce: 'n-1',
      name: 'x'.repeat(100),
    });
    expect(d).toMatchObject({
      model: 'LAVA LXX503',
      os: 'Android 14',
      nonce: 'n-1',
      push_token: null,
    });
    expect(d.name).toHaveLength(60);
  });

  it('fills defaults for missing text fields', () => {
    expect(parseDeviceInput({ pubkey: PUB, nonce: 'n' })).toMatchObject({
      model: 'Unknown phone',
      os: 'Unknown OS',
      app_version: '0.0.0',
      name: 'Phone',
    });
  });

  it('rejects a missing nonce, a non base64 key and a key that is not 32 bytes', () => {
    expect(() => parseDeviceInput({ pubkey: PUB })).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => parseDeviceInput({ pubkey: '***', nonce: 'n' })).toThrow(
      expect.objectContaining({ code: 'bad_device' }),
    );
    expect(() =>
      parseDeviceInput({ pubkey: Buffer.alloc(16, 1).toString('base64'), nonce: 'n' }),
    ).toThrow(/32 bytes/);
  });
});

describe('buildDeviceRow', () => {
  const input = parseDeviceInput({
    model: 'Pixel',
    os: 'Android',
    app_version: '1',
    pubkey: PUB,
    nonce: 'n',
  });

  it('returns a fresh 32 byte token once and stores only its sha256 hex', async () => {
    const req = new Request('https://x.test', { headers: { 'x-forwarded-for': '10.0.0.5' } });
    const a = await buildDeviceRow(req, 'user-1', input, 'pending');
    const b = await buildDeviceRow(req, 'user-1', input, 'pending');
    expect(base64ToBytes(a.token)).toHaveLength(32);
    expect(a.token).not.toBe(b.token);
    expect(a.row.token_hash).toBe(await sha256Hex(base64ToBytes(a.token)));
    expect(JSON.stringify(a.row)).not.toContain(a.token);
    expect(a.row).toMatchObject({
      id: a.id,
      user_id: 'user-1',
      status: 'pending',
      decided_at: null,
      last_ip: '10.0.0.5',
      last_geo: null,
    });
    expect(a.row.pubkey).toBe(`\\x${'07'.repeat(32)}`);
  });

  it('an approved first Admin device carries a decided_at timestamp', async () => {
    const row = (await buildDeviceRow(new Request('https://x.test'), 'admin', input, 'approved'))
      .row;
    expect(row.status).toBe('approved');
    expect(typeof row.decided_at).toBe('string');
    expect(row.last_ip).toBeNull();
  });
});

describe('rotateToken', () => {
  it('writes a new hash and returns the new token', async () => {
    const update = jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) }));
    const db = { from: jest.fn(() => ({ update })) } as never;
    const token = await rotateToken(db, 'dev-1');
    expect(base64ToBytes(token)).toHaveLength(32);
    const values = (update.mock.calls[0] as unknown[])[0] as { token_hash: string };
    expect(values.token_hash).toBe(await sha256Hex(base64ToBytes(token)));
  });
});
