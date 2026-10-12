// covers: AC-1 (no token hashes, nonces or Vault ids), AC-2 (a server sealed box opens with the
// app's box.open), AC-4 (prune choice) of spec 0006
import { box } from '../../../../src/crypto';
import { deriveRecoveryKeypair } from '../../../../src/crypto/recovery';
import { fileNameFor, rowsToPrune, stripRow, TABLES } from '../backup.ts';
import { seal, sha256Hex } from '../sealed-box.ts';

describe('server sealed box (AC-2)', () => {
  it('is opened by the app with the recovery secret', () => {
    const kit = deriveRecoveryKeypair(new Uint8Array(32).fill(7));
    const doc = new TextEncoder().encode(
      JSON.stringify({ schema: 1, tables: { profiles: [{ id: 'x' }] } }),
    );
    const wire = seal(kit.publicKey, doc.slice());
    expect(wire[0]).toBe(1);
    expect(new TextDecoder().decode(box.open(kit.secretKey, wire))).toBe(
      new TextDecoder().decode(doc),
    );
  });

  it('fails for any other key and for a flipped byte', () => {
    const kit = deriveRecoveryKeypair(new Uint8Array(32).fill(7));
    const other = deriveRecoveryKeypair(new Uint8Array(32).fill(8));
    const wire = seal(kit.publicKey, new Uint8Array([1, 2, 3]));
    expect(() => box.open(other.secretKey, wire)).toThrow();
    const flipped = wire.slice();
    flipped[wire.length - 1] = (flipped[wire.length - 1] ?? 0) ^ 1;
    expect(() => box.open(kit.secretKey, flipped)).toThrow();
  });

  it('matches the app vector for fixed ephemeral key and nonce', () => {
    const kit = deriveRecoveryKeypair(new Uint8Array(32).fill(7));
    const eph = new Uint8Array(32).fill(3);
    const nonce = new Uint8Array(24).fill(5);
    const a = seal(kit.publicKey, new Uint8Array([9, 9]), eph.slice(), nonce);
    const b = seal(kit.publicKey, new Uint8Array([9, 9]), eph.slice(), nonce);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
    expect(Array.from(box.open(kit.secretKey, a))).toEqual([9, 9]);
  });
});

describe('snapshot contents (AC-1)', () => {
  it('drops token hashes, nonces and Vault ids', () => {
    expect(
      stripRow('devices', { id: 'd', token_hash: 'h', registration_nonce: 'n', model: 'm' }),
    ).toEqual({
      id: 'd',
      model: 'm',
    });
    expect(
      stripRow('drive_accounts', { slot: 'a', vault_secret_id: 's', google_email: 'e' }),
    ).toEqual({
      slot: 'a',
      google_email: 'e',
    });
    expect(stripRow('vault_items', { id: 'v', deleted_at: 'x' })).toEqual({
      id: 'v',
      deleted_at: 'x',
    });
  });

  it('dumps parents before children', () => {
    expect(TABLES.indexOf('profiles')).toBeLessThan(TABLES.indexOf('devices'));
    expect(TABLES.indexOf('devices')).toBeLessThan(TABLES.indexOf('key_material'));
    expect(TABLES.indexOf('vault_items')).toBeLessThan(TABLES.indexOf('file_blobs'));
  });
});

describe('pruning (AC-4)', () => {
  it('drops snapshots older than 30 days and an earlier one from today', () => {
    const now = new Date('2026-10-12T03:00:00Z');
    const rows = [
      { id: 'today', taken_at: '2026-10-12T01:00:00Z' },
      { id: 'yesterday', taken_at: '2026-10-11T03:00:00Z' },
      { id: 'day30', taken_at: '2026-09-12T04:00:00Z' },
      { id: 'day31', taken_at: '2026-09-11T03:00:00Z' },
    ];
    expect(rowsToPrune(rows, now).sort()).toEqual(['day31', 'today']);
    expect(fileNameFor(now)).toBe('f2h-backup-2026-10-12.bin');
  });
});
