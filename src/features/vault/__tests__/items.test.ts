// covers: AC-6 and AC-10 of spec 0004 (the shared vault items path: kind filter, parse guard,
// no plaintext in rows, a fresh data key per write, partial insert reporting)
import { useSession } from '@/state/session.store';

import { createItems, listItems, updateItem, VaultItemError } from '../items';

type Row = Record<string, unknown> & { id: string; kind: string; version: number };
const mockRows: Row[] = [];
let mockFailInsertAt = -1;

jest.mock('@/services/supabase', () => {
  const from = () => {
    const filters: [string, unknown][] = [];
    let patch: Record<string, unknown> | null = null;
    const match = (r: Row) => filters.every(([c, v]) => r[c] === v) && r.deleted_at === null;
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain,
      is: () => chain,
      eq: (c: string, v: unknown) => {
        filters.push([c, v]);
        return chain;
      },
      order: async () => ({ data: mockRows.filter(match), error: null }),
      insert: async (rows: Row[]) => {
        if (mockFailInsertAt === 0) return { error: { message: 'offline' } };
        mockFailInsertAt -= 1;
        for (const r of rows) mockRows.push({ ...r, version: 1, deleted_at: null });
        return { error: null };
      },
      update: (p: Record<string, unknown>) => {
        patch = p;
        return chain;
      },
      maybeSingle: async () => {
        const row = mockRows.find(match);
        if (!row || !patch) return { data: row ?? null, error: null };
        Object.assign(row, patch, { version: row.version + 1 });
        return { data: { version: row.version }, error: null };
      },
    });
    return chain;
  };
  return { supabase: { from } };
});

const parseNote = (raw: unknown) =>
  (raw as { type?: string }).type === 'note' ? (raw as { type: 'note'; body: string }) : null;

beforeEach(() => {
  mockRows.length = 0;
  mockFailInsertAt = -1;
  useSession.setState({
    mk: new Uint8Array(32).fill(3),
    profile: { id: 'u1', email: 'a@x', display_name: 'A', role: 'member', status: 'active' },
  });
});

describe('vault items', () => {
  it('lists only the asked kind and lets the parser refuse a payload', async () => {
    await createItems('note', [{ type: 'note', body: 'secret body' }]);
    await createItems('contact', [{ type: 'contact', name: 'x' }]);
    await createItems('note', [{ type: 'other', body: 'y' }]);
    expect(mockRows.map((r) => r.kind)).toEqual(['note', 'contact', 'note']);
    expect(JSON.stringify(mockRows)).not.toContain('secret body');
    const { items, skipped } = await listItems('note', parseNote);
    expect(items.map((i) => i.payload.body)).toEqual(['secret body']);
    expect(skipped).toBe(1);
  });

  it('wraps every write under a fresh data key', async () => {
    const [a] = await createItems('note', [{ type: 'note', body: 'v1' }]);
    const before = mockRows[0]?.dek_wrapped;
    await updateItem(a!.id, a!.version, { type: 'note', body: 'v2' });
    expect(mockRows[0]?.dek_wrapped).not.toBe(before);
    expect((await listItems('note', parseNote)).items[0]?.payload.body).toBe('v2');
  });

  it('reports how many items landed when a later batch fails', async () => {
    mockFailInsertAt = 1;
    const many = Array.from({ length: 70 }, (_, i) => ({ type: 'note', body: `n${i}` }));
    await expect(createItems('note', many)).rejects.toMatchObject({
      code: 'vault_insert_failed',
      landed: 50,
    });
    expect(VaultItemError).toBeDefined();
  });
});
