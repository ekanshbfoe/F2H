// covers: AC-6 and AC-7 of spec 0006 (the restore script: kit words → key, open a snapshot the
// app's sealed box made, refuse a wrong kit, and the SQL it writes)
import { box, mnemonic, recovery } from '@/crypto';

import {
  buildRestoreSql,
  fingerprint,
  literal,
  openSealed,
  recoveryFromWords,
  type Snapshot,
} from '../../scripts/restore-backup';

const SEED = new Uint8Array(32).fill(11);
const WORDS = mnemonic.fromSeed(SEED).join(' ');

const snapshot: Snapshot = {
  schema: 1,
  taken_at: '2026-10-12T03:00:00.000Z',
  auth: {
    users: [
      { id: 'u1', email: "o'brien@example.com", encrypted_password: '$2a$10$x', created_at: 'c' },
    ],
    identities: [
      {
        id: 'i1',
        user_id: 'u1',
        provider: 'email',
        provider_id: 'u1',
        identity_data: { sub: 'u1' },
      },
    ],
  },
  tables: {
    family_config: [
      { id: 1, admin_user_id: 'u1', admin_recovery_pubkey: '\\xabcd', recovery_fingerprint: 'x' },
    ],
    profiles: [{ id: 'u1', email: "o'brien@example.com", role: 'admin' }],
    allowed_members: [],
    devices: [{ id: 'd1', user_id: 'u1', status: 'approved', push_token: 'ExponentPushToken[x]' }],
    key_material: [{ user_id: 'u1', mk_wrapped_pw: 'pw', updated_by_device: 'd1' }],
    vault_items: [{ id: 'v1', owner_id: 'u1', kind: 'contact', version: 3, deleted_at: null }],
    file_blobs: [],
    drive_accounts: [{ slot: 'a', google_email: 'g@example.com' }],
    recovery_grants: [],
    audit_log: [{ id: 7, action: 'signup', meta: { a: 1 } }],
    backups: [],
  },
};

describe('restore script', () => {
  it('rebuilds the same key the app derives from the kit', () => {
    const kit = recoveryFromWords(`  ${WORDS.toUpperCase()}  `);
    const app = recovery.deriveRecoveryKeypair(SEED);
    expect(Array.from(kit.publicKey)).toEqual(Array.from(app.publicKey));
    expect(fingerprint(kit.publicKey)).toBe(recovery.fingerprint(app.publicKey));
    expect(() => recoveryFromWords('abandon '.repeat(24))).toThrow(/24 valid kit words/);
  });

  it('opens a file sealed by the app box and refuses another kit', () => {
    const kit = recoveryFromWords(WORDS);
    const doc = new TextEncoder().encode(JSON.stringify(snapshot));
    const wire = box.seal(kit.publicKey, doc);
    expect(JSON.parse(new TextDecoder().decode(openSealed(kit.secretKey, wire)))).toEqual(snapshot);
    const other = recoveryFromWords(mnemonic.fromSeed(new Uint8Array(32).fill(12)).join(' '));
    expect(() => openSealed(other.secretKey, wire)).toThrow(/does not open with this kit/);
    expect(() => openSealed(kit.secretKey, new Uint8Array(10))).toThrow(/Not an F2H sealed file/);
  });

  it('writes SQL that loads without triggers, revokes old phones and skips Drive accounts', () => {
    const sql = buildRestoreSql(snapshot);
    const lines = sql.split('\n');
    expect(lines[1]).toBe('begin;');
    expect(lines[2]).toBe("set local session_replication_role = 'replica';");
    expect(lines.at(-2)).toBe('commit;');
    expect(sql.indexOf('insert into auth.users')).toBeLessThan(
      sql.indexOf('insert into public.profiles'),
    );
    expect(sql.indexOf('insert into public.devices')).toBeLessThan(
      sql.indexOf('insert into public.key_material'),
    );
    expect(sql).toContain("'o''brien@example.com'");
    expect(sql).toContain('on conflict (id) do update set');
    const device = lines.find((l) => l.startsWith('insert into public.devices'))!;
    expect(device).toContain("'revoked'");
    expect(device).toContain("'restored-d1'");
    expect(device).not.toContain('ExponentPushToken');
    expect(sql).not.toContain('drive_accounts');
    expect(sql).toContain(`'${JSON.stringify({ a: 1 })}'::jsonb`);
    expect(sql).toContain("setval('public.audit_log_id_seq'");
  });

  it('quotes literals safely', () => {
    expect(literal(null)).toBe('null');
    expect(literal(3)).toBe('3');
    expect(literal(true)).toBe('true');
    expect(literal("it's")).toBe("'it''s'");
    expect(literal({ q: "x'y" })).toBe(`'{"q":"x''y"}'::jsonb`);
  });
});
