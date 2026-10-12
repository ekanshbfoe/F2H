// covers: AC-6 (version retry, soft delete), AC-8 (lock clears the store, a late load is dropped),
// and the envelope round trip for contacts (spec 0003)
import { envelope, toBase64 } from '@/crypto';
import { useLock } from '@/features/lock/lock.store';
import { useSession } from '@/state/session.store';

import { ContactsError, createContacts, deleteContact, listContacts, updateContact } from '../api';
import { contactPayloadSchema, type ContactPayload } from '../model';
import { useContacts } from '../store';

type Row = {
  id: string;
  owner_id: string;
  kind: string;
  dek_wrapped: string;
  ciphertext: string;
  version: number;
  created_at: string;
  deleted_at: string | null;
};
const mockRows: Row[] = [];
let mockStaleOnce = 0;

jest.mock('@/services/supabase', () => {
  const from = () => {
    const filters: [string, unknown][] = [];
    let isNull: string | null = null;
    let patch: Record<string, unknown> | null = null;
    const match = (r: Row) =>
      filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v) &&
      (!isNull || (r as Record<string, unknown>)[isNull] === null);
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain,
      eq: (c: string, v: unknown) => {
        filters.push([c, v]);
        return chain;
      },
      is: (c: string) => {
        isNull = c;
        return chain;
      },
      order: async () => ({ data: mockRows.filter(match), error: null }),
      insert: async (rows: Row[]) => {
        for (const r of rows)
          mockRows.push({ ...r, version: 1, created_at: 'now', deleted_at: null });
        return { error: null };
      },
      update: (p: Record<string, unknown>) => {
        patch = p;
        return chain;
      },
      maybeSingle: async () => {
        const row = mockRows.find(match);
        if (!patch) return { data: row ?? null, error: null };
        if (!row) return { data: null, error: null };
        if (mockStaleOnce > 0) {
          mockStaleOnce -= 1;
          row.version += 1; // another phone wrote meanwhile
        }
        if (patch.version !== row.version) {
          return { data: null, error: { code: 'P0001', message: 'stale_version' } };
        }
        Object.assign(row, patch, { version: row.version + 1 });
        return { data: { version: row.version }, error: null };
      },
    });
    return chain;
  };
  return { supabase: { from } };
});

const MK = new Uint8Array(32).fill(7);
const payload = (name: string): ContactPayload =>
  contactPayloadSchema.parse({
    v: 1,
    type: 'contact',
    name,
    phones: [{ number: '98765 43210', label: 'mobile' }],
    channels: { call: true, whatsapp: true },
    source: 'manual',
  });

beforeEach(() => {
  mockRows.length = 0;
  mockStaleOnce = 0;
  useSession.setState({
    mk: new Uint8Array(MK),
    profile: { id: 'u1', email: 'a@x', display_name: 'A', role: 'member', status: 'active' },
  });
  useContacts.getState().clear();
});

describe('contacts api', () => {
  it('encrypts each contact under its own key and decrypts it back', async () => {
    const [a, b] = await createContacts([payload('Papa'), payload('Mummy')]);
    expect(mockRows).toHaveLength(2);
    expect(mockRows[0]?.kind).toBe('contact');
    expect(mockRows[0]?.ciphertext).not.toContain('Papa');
    expect(mockRows[0]?.dek_wrapped).not.toBe(mockRows[1]?.dek_wrapped);
    const { items, skipped } = await listContacts();
    expect(skipped).toBe(0);
    expect(items.map((c) => c.payload.name)).toEqual(['Papa', 'Mummy']);
    expect(items[0]?.id).toBe(a?.id);
    expect(items[1]?.payload.phones[0]?.number).toBe('+919876543210');
    expect(b?.version).toBe(1);
  });

  it('skips a row it cannot open and counts it', async () => {
    await createContacts([payload('Papa')]);
    const foreignDek = envelope.generateDek();
    mockRows.push({
      ...mockRows[0]!,
      id: 'other',
      dek_wrapped: toBase64(envelope.wrapDek(new Uint8Array(32).fill(9), foreignDek, 'other')),
    });
    const { items, skipped } = await listContacts();
    expect(items).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('reports progress in batches of 50', async () => {
    const progress: number[] = [];
    await createContacts(
      Array.from({ length: 120 }, (_, i) => payload(`C${i}`)),
      (n) => progress.push(n),
    );
    expect(progress).toEqual([50, 100, 120]);
  });

  it('retries a stale version once with the fresh version (AC-6)', async () => {
    const [c] = await createContacts([payload('Papa')]);
    mockStaleOnce = 1;
    const saved = await updateContact(c!.id, c!.version, payload('Papa ji'));
    expect(saved.version).toBe(3);
    const { items } = await listContacts();
    expect(items[0]?.payload.name).toBe('Papa ji');
  });

  it('gives up after a second stale answer', async () => {
    const [c] = await createContacts([payload('Papa')]);
    mockStaleOnce = 2;
    await expect(updateContact(c!.id, c!.version, payload('X'))).rejects.toMatchObject({
      code: 'stale_version',
    });
  });

  it('soft deletes: the row stays, the list hides it (AC-6)', async () => {
    const [c] = await createContacts([payload('Papa')]);
    await deleteContact(c!.id, c!.version);
    expect(mockRows[0]?.deleted_at).not.toBeNull();
    expect((await listContacts()).items).toHaveLength(0);
  });

  it('refuses to run while locked', async () => {
    useSession.setState({ mk: null });
    await expect(listContacts()).rejects.toMatchObject({ code: 'locked' });
    await expect(createContacts([payload('A')])).rejects.toBeInstanceOf(Error);
    expect(ContactsError).toBeDefined();
  });
});

describe('contacts store (AC-8)', () => {
  it('loads, then empties itself on a lock generation bump', async () => {
    await createContacts([payload('Papa')]);
    await useContacts.getState().load();
    expect(useContacts.getState().status).toBe('ready');
    expect(Object.keys(useContacts.getState().items)).toHaveLength(1);
    useLock.getState().bumpGeneration();
    expect(useContacts.getState().status).toBe('idle');
    expect(useContacts.getState().items).toEqual({});
  });

  it('drops a load that finishes after a lock', async () => {
    await createContacts([payload('Papa')]);
    const pending = useContacts.getState().load();
    useLock.getState().bumpGeneration();
    await pending;
    expect(useContacts.getState().items).toEqual({});
  });

  it('save, saveMany and remove keep the store in step', async () => {
    const s = useContacts.getState();
    const one = await s.save(payload('A'));
    expect(await s.saveMany([payload('B'), payload('C')])).toBe(2);
    expect(Object.keys(useContacts.getState().items)).toHaveLength(3);
    const edited = await useContacts.getState().save(payload('A2'), one);
    expect(useContacts.getState().items[one.id]?.payload.name).toBe('A2');
    await useContacts.getState().remove(edited);
    expect(useContacts.getState().items[one.id]).toBeUndefined();
  });
});
