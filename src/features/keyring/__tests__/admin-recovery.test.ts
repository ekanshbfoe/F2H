// covers: AC-4 (24 words, 3 confirmed, key published once, seed kept as a vault note, Admin MK sealed to it)
import { box, envelope, fromBase64, mnemonic, recovery, toBase64, verifier } from '@/crypto';
import {
  exportRecoveryKit,
  exportRecoveryWords,
  finishRecoveryKit,
  loadRecoverySecretKey,
  pickConfirmPositions,
  startRecoveryKit,
} from '../admin-recovery';

type Row = Record<string, unknown>;
const mockItems: Row[] = [];
const mockRpc = jest.fn();
const mockStore = new Map<string, string>();

jest.mock('@/services/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: () => {
      const filters: [string, unknown][] = [];
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        delete: () => ({
          eq: async (_c: string, id: unknown) => {
            const i = mockItems.findIndex((r) => r.id === id);
            if (i >= 0) mockItems.splice(i, 1);
            return { error: null };
          },
        }),
        insert: async (row: Row) => {
          mockItems.push({ ...row, created_at: new Date().toISOString(), deleted_at: null });
          return { error: null };
        },
        select: () => chain,
        eq: (c: string, v: unknown) => {
          filters.push([c, v]);
          return chain;
        },
        is: () => chain,
        order: () => chain,
        maybeSingle: async () => ({
          data: mockItems.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null,
        }),
        then: (resolve: (v: { data: Row[] }) => void) =>
          resolve({ data: mockItems.filter((r) => filters.every(([c, v]) => r[c] === v)) }),
      });
      return chain;
    },
  },
}));
jest.mock('@/services/secure-store', () => ({
  SecureKeys: { recoveryItemId: 'f2h.recovery_item_id' },
  secureGet: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  secureSet: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
}));

const ADMIN = 'a0000000-0000-4000-8000-000000000001';

beforeEach(() => {
  mockItems.length = 0;
  mockStore.clear();
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: null, error: null });
});

describe('recovery kit', () => {
  it('draft: 24 valid BIP39 words and a 4 group fingerprint of the derived public key', () => {
    const draft = startRecoveryKit();
    expect(draft.words).toHaveLength(24);
    expect(mnemonic.toSeed(draft.words)).toEqual(draft.seed);
    const pair = recovery.deriveRecoveryKeypair(draft.seed);
    expect(draft.fingerprint).toBe(recovery.fingerprint(pair.publicKey));
    expect(draft.fingerprint).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){3}$/);
  });

  it('asks for three distinct word positions between 1 and 24', () => {
    for (let i = 0; i < 20; i += 1) {
      const p = pickConfirmPositions();
      expect(p).toHaveLength(3);
      expect(new Set(p).size).toBe(3);
      expect(p.every((n) => n >= 1 && n <= 24)).toBe(true);
      expect([...p].sort((a, b) => a - b)).toEqual(p);
    }
  });

  it('finish: publishes the public key, seals the Admin MK to it, and stores the seed as a vault note', async () => {
    const draft = startRecoveryKit();
    const kek = new Uint8Array(32).fill(5);
    const mk = await finishRecoveryKit(draft, kek, ADMIN);

    const [name, args] = mockRpc.mock.calls[0] as [string, Record<string, string>];
    expect(name).toBe('admin_first_run');
    const pair = recovery.deriveRecoveryKeypair(mnemonic.toSeed(draft.words));
    expect(fromBase64(String(args.p_recovery_pub))).toEqual(pair.publicKey);
    expect(args.p_fingerprint).toBe(draft.fingerprint);
    expect(envelope.unwrapMk(kek, fromBase64(String(args.p_mk_wrapped_pw)), ADMIN)).toEqual(mk);
    expect(box.open(pair.secretKey, fromBase64(String(args.p_mk_wrapped_admin)))).toEqual(mk);
    expect(verifier.check(mk, ADMIN, fromBase64(String(args.p_mk_verifier)))).toBe(true);

    expect(mockItems).toHaveLength(1);
    expect(mockItems[0]).toMatchObject({ kind: 'note', owner_id: ADMIN });
    expect(mockStore.get('f2h.recovery_item_id')).toBe(mockItems[0]?.id);
    // The note holds no plaintext seed.
    expect(JSON.stringify(mockItems[0])).not.toContain(String(args.p_recovery_pub).slice(0, 10));
  });

  it('the stored note gives back the recovery secret and the same 24 words later', async () => {
    const draft = startRecoveryKit();
    const words = [...draft.words];
    const mk = await finishRecoveryKit(draft, new Uint8Array(32).fill(5), ADMIN);
    const secret = await loadRecoverySecretKey(mk);
    expect(secret).toEqual(recovery.deriveRecoveryKeypair(mnemonic.toSeed(words)).secretKey);
    await expect(exportRecoveryWords(mk)).resolves.toEqual(words);
    const kit = await exportRecoveryKit(mk);
    expect(kit?.words).toEqual(words);
    expect(kit?.fingerprint).toBe(draft.fingerprint);
    expect(kit?.publicKey).toBe(
      toBase64(recovery.deriveRecoveryKeypair(mnemonic.toSeed(words)).publicKey),
    );
    mockStore.clear(); // no hint: falls back to scanning the notes
    const again = await loadRecoverySecretKey(mk);
    expect(again).toEqual(secret);
  });

  it('treats a lost RPC reply as success when the published key is ours', async () => {
    const draft = startRecoveryKit();
    const pub = toBase64(recovery.deriveRecoveryKeypair(mnemonic.toSeed(draft.words)).publicKey);
    mockRpc.mockImplementation(async (name: string) =>
      name === 'admin_first_run'
        ? { data: null, error: { message: 'network' } }
        : { data: [{ recovery_pub: pub, fingerprint: draft.fingerprint }], error: null },
    );
    const mk = await finishRecoveryKit(draft, new Uint8Array(32).fill(5), ADMIN);
    expect(mk).toHaveLength(32);
    expect(mockItems).toHaveLength(1);
  });

  it('refuses to continue when the server rejects a second first run', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'already_initialized' } });
    await expect(
      finishRecoveryKit(startRecoveryKit(), new Uint8Array(32).fill(5), ADMIN),
    ).rejects.toThrow(/already_initialized/);
    // the note written before the publish is removed again
    expect(mockItems).toHaveLength(0);
  });
});
