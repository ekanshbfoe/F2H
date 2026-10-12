// covers: AC-4, AC-5, AC-6, AC-7, AC-9 of child spec 0001-drive-redundancy: real chunked
// encryption into a memory file system, 1 MiB Content-Range PUTs to both sessions, resume after a
// dropped chunk, one Drive failing, the completion payload, and the download hash check.
import { createMemoryFs, createSha256, envelope, fromBase64, toHex, utf8ToBytes } from '@/crypto';
import { useSession } from '@/state/session.store';

import { downloadFile, uploadFile, type UploadProgress } from '../api';
import { parsePayload, UPLOAD_CHUNK, type StoredFile } from '../model';

const mockFs = createMemoryFs();
const mockCall = jest.fn<Promise<unknown>, [string, Record<string, unknown>]>();
type Put = { url: string; range: string; bytes: Uint8Array };
const mockPuts: Put[] = [];
let mockFailOnce: string | null = null;
let mockDeadSession: string | null = null;
const mockReceived = new Map<string, Uint8Array[]>();
let mockDownload: Uint8Array = new Uint8Array(0);
let mockItemRow: { dek_wrapped: string } | null = null;

jest.mock('@/services/file-adapter', () => ({
  expoFileAdapter: {
    size: (uri: string) => mockFs.size(uri),
    read: (uri: string, p: number, l: number) => mockFs.read(uri, p, l),
    create: (uri: string) => mockFs.create(uri),
    append: (uri: string, b: Uint8Array) => mockFs.append(uri, b),
  },
  scratchUri: (dir: string, name: string) => `mem://${dir}/${name}`,
  removeFile: (uri: string) => {
    mockFs.files.delete(uri);
  },
}));
jest.mock('expo-file-system', () => ({
  UploadType: { BINARY_CONTENT: 0 },
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    async upload(url: string, opts: { headers: Record<string, string> }) {
      const range = opts.headers['Content-Range'] ?? '';
      if (url === mockDeadSession) return { status: 500, body: '', headers: {} };
      if (mockFailOnce === range) {
        mockFailOnce = null;
        throw new Error('network dropped');
      }
      const bytes = mockFs.get(this.uri).slice();
      mockPuts.push({ url, range, bytes });
      const list = mockReceived.get(url) ?? [];
      list.push(bytes);
      mockReceived.set(url, list);
      const [, end, total] = /bytes (\d+)-(\d+)\/(\d+)/
        .exec(range)!
        .slice(1)
        .map(Number) as number[];
      return { status: end! + 1 === total ? 200 : 308, body: '', headers: {} };
    }
    static async downloadFileAsync(_url: string, dest: { uri: string }) {
      mockFs.set(dest.uri, mockDownload);
      return dest;
    }
  },
}));
jest.mock('@/services/functions', () => ({
  callFunction: (...a: [string, Record<string, unknown>]) => mockCall(...a),
}));
jest.mock('@/services/supabase', () => ({
  getDeviceToken: () => null,
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mockItemRow, error: null }) }),
      }),
    }),
  },
}));
jest.mock('@/features/vault/items', () => ({ listItems: jest.fn() }));

// fetch answers the resume query: Google says it holds everything up to the last good byte
const fetchMock = jest.fn(async (url: string) => {
  const got = (mockReceived.get(url) ?? []).reduce((n, b) => n + b.length, 0);
  return new Response(null, { status: 308, headers: got ? { Range: `bytes=0-${got - 1}` } : {} });
});

const MK = new Uint8Array(32).fill(5);
const PLAIN = Uint8Array.from({ length: 2.5 * 1024 * 1024 }, (_, i) => (i * 31) & 255);

beforeEach(() => {
  mockFs.files.clear();
  mockFs.set('mem://picked/photo.jpg', PLAIN);
  mockCall.mockReset();
  mockPuts.length = 0;
  mockReceived.clear();
  mockFailOnce = null;
  mockDeadSession = null;
  mockItemRow = null;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockClear();
  useSession.setState({
    mk: new Uint8Array(MK),
    profile: { id: 'u1', email: 'a@x', display_name: 'A', role: 'member', status: 'active' },
  });
  mockCall.mockImplementation(async (name, body) => {
    if (name === 'drive-upload-session') {
      return { blob_id: body.blob_id, session_a: 'https://up/a', session_b: 'https://up/b' };
    }
    if (name === 'drive-upload-complete') return { item_id: body.item_id, state: 'ok' };
    throw new Error(`unexpected ${name}`);
  });
});

const picked = {
  uri: 'mem://picked/photo.jpg',
  name: 'photo.jpg',
  mime: 'image/jpeg',
  size: PLAIN.length,
};

describe('uploadFile', () => {
  it('encrypts, sends 1 MiB ranges to both Drives and completes with a bound payload', async () => {
    const progress: UploadProgress[] = [];
    const { item, state } = await uploadFile(picked, (p) => progress.push(p));
    expect(state).toBe('ok');

    const session = mockCall.mock.calls[0]![1];
    const sizeCt = Number(session.size_ct);
    const sentA = mockPuts.filter((p) => p.url === 'https://up/a');
    expect(sentA.map((p) => p.range)).toEqual([
      `bytes 0-${UPLOAD_CHUNK - 1}/${sizeCt}`,
      `bytes ${UPLOAD_CHUNK}-${2 * UPLOAD_CHUNK - 1}/${sizeCt}`,
      `bytes ${2 * UPLOAD_CHUNK}-${sizeCt - 1}/${sizeCt}`,
    ]);
    expect(mockPuts.filter((p) => p.url === 'https://up/b')).toHaveLength(3);

    // what reached Google is exactly the ciphertext whose hash the session declared
    const h = createSha256();
    for (const p of sentA) h.update(p.bytes);
    expect(toHex(h.digest())).toBe(session.sha256_ct);
    expect(sentA.some((p) => toHex(p.bytes).includes(toHex(PLAIN.subarray(0, 64))))).toBe(false);

    // the item is the metadata encrypted under the same DEK, bound to the blob id and hash
    const done = mockCall.mock.calls[1]![1];
    const dek = envelope.unwrapDek(MK, fromBase64(String(done.dek_wrapped)), String(done.item_id));
    const meta = parsePayload(
      JSON.parse(
        new TextDecoder().decode(
          envelope.decryptItem(dek, fromBase64(String(done.ciphertext)), String(done.item_id)),
        ),
      ),
    );
    expect(meta).toMatchObject({
      name: 'photo.jpg',
      blob_id: session.blob_id,
      sha256_ct: session.sha256_ct,
      size: PLAIN.length,
    });
    expect(item.payload).toEqual(meta);
    expect(progress.map((p) => p.phase)).toEqual(
      expect.arrayContaining(['encrypting', 'uploading', 'verifying', 'done']),
    );
    expect(progress.at(-1)).toMatchObject({ a: 1, b: 1 });
    // the temporary ciphertext is gone
    expect([...mockFs.files.keys()].filter((k) => k.endsWith('.ct'))).toEqual([]);
  });

  it('asks the session where it stopped after a dropped chunk and carries on', async () => {
    const session = { size: 0 };
    mockCall.mockImplementation(async (name, body) => {
      if (name === 'drive-upload-session') {
        session.size = Number(body.size_ct);
        mockFailOnce = `bytes ${UPLOAD_CHUNK}-${2 * UPLOAD_CHUNK - 1}/${session.size}`;
        return { blob_id: body.blob_id, session_a: 'https://up/a', session_b: null };
      }
      return { item_id: body.item_id, state: 'degraded' };
    });
    const { state } = await uploadFile(picked, () => undefined);
    expect(state).toBe('degraded');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://up/a',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(mockPuts.map((p) => p.range.split('/')[0])).toEqual([
      `bytes 0-${UPLOAD_CHUNK - 1}`,
      `bytes ${UPLOAD_CHUNK}-${2 * UPLOAD_CHUNK - 1}`,
      `bytes ${2 * UPLOAD_CHUNK}-${session.size - 1}`,
    ]);
  });

  it('tolerates one Drive refusing and still completes', async () => {
    mockDeadSession = 'https://up/b';
    mockCall.mockImplementation(async (name, body) =>
      name === 'drive-upload-session'
        ? { blob_id: body.blob_id, session_a: 'https://up/a', session_b: 'https://up/b' }
        : { item_id: body.item_id, state: 'degraded' },
    );
    const progress: UploadProgress[] = [];
    await expect(uploadFile(picked, (p) => progress.push(p))).resolves.toMatchObject({
      state: 'degraded',
    });
    expect(progress.at(-1)).toMatchObject({ b: null });
  });

  it('maps no linked Drive and a hash mismatch', async () => {
    mockCall.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'no_drive_linked' }));
    await expect(uploadFile(picked, () => undefined)).rejects.toMatchObject({
      code: 'no_drive_linked',
    });
    mockCall.mockImplementation(async (name, body) => {
      if (name === 'drive-upload-session')
        return { blob_id: body.blob_id, session_a: 'https://up/a', session_b: null };
      throw Object.assign(new Error('x'), { code: 'hash_mismatch' });
    });
    await expect(uploadFile(picked, () => undefined)).rejects.toMatchObject({
      code: 'hash_mismatch',
    });
  });
});

describe('downloadFile', () => {
  async function uploaded(): Promise<{ item: StoredFile; ct: Uint8Array; dekWrapped: string }> {
    let ct = new Uint8Array(0);
    let dekWrapped = '';
    mockCall.mockImplementation(async (name, body) => {
      if (name === 'drive-upload-session')
        return { blob_id: body.blob_id, session_a: 'https://up/a', session_b: null };
      dekWrapped = String(body.dek_wrapped);
      return { item_id: body.item_id, state: 'degraded' };
    });
    const { item } = await uploadFile(picked, () => undefined);
    const parts = mockReceived.get('https://up/a') ?? [];
    ct = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      ct.set(p, o);
      o += p.length;
    }
    return { item, ct, dekWrapped };
  }

  it('verifies the hash, decrypts and returns the plaintext copy', async () => {
    const { item, ct, dekWrapped } = await uploaded();
    mockDownload = ct;
    mockItemRow = { dek_wrapped: dekWrapped };
    mockCall.mockResolvedValueOnce({ mode: 'token', url: 'https://g/x?alt=media', token: 'ya29' });
    const out = await downloadFile(item);
    expect(out).toBe('mem://f2h-open/photo.jpg');
    expect(toHex(mockFs.get(out))).toBe(toHex(PLAIN));
  });

  it('refuses a copy whose hash does not match and decrypts nothing', async () => {
    const { item, ct, dekWrapped } = await uploaded();
    const tampered = ct.slice();
    tampered[100] = (tampered[100] ?? 0) ^ 1;
    mockDownload = tampered;
    mockItemRow = { dek_wrapped: dekWrapped };
    mockCall.mockResolvedValueOnce({ mode: 'token', url: 'https://g/x?alt=media', token: 'ya29' });
    await expect(downloadFile(item)).rejects.toMatchObject({ code: 'hash_mismatch' });
    expect(mockFs.files.has('mem://f2h-open/photo.jpg')).toBe(false);
    expect(utf8ToBytes('x')).toHaveLength(1);
  });
});
