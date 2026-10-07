// covers: AC-3 (signup key material shape), AC-10 (admin wrap verification), AC-12 (unwrap after approval)
import { box, fromBase64, recovery, toBase64, verifier } from '@/crypto';
import { verifyMemberWrap } from '@/features/admin/api';
import { createMemberKeys } from '../bootstrap';

jest.mock('@/services/supabase', () => ({ supabase: {} }));

const USER = '11111111-1111-4111-8111-111111111111';
const kek = new Uint8Array(32).fill(7);

describe('member key material', () => {
  const seed = new Uint8Array(32).fill(42);
  const admin = recovery.deriveRecoveryKeypair(seed);
  const pubB64 = toBase64(admin.publicKey);

  it('wraps a fresh MK for the password, the Admin and the verifier (AC-3)', () => {
    const keys = createMemberKeys(kek, USER, pubB64);
    expect(keys.mk).toHaveLength(32);
    for (const field of ['mk_wrapped_pw', 'mk_wrapped_admin', 'mk_verifier'] as const) {
      expect(keys[field]).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(keys[field].length).toBeGreaterThan(40);
    }
    expect(box.open(admin.secretKey, fromBase64(keys.mk_wrapped_admin))).toEqual(keys.mk);
    expect(verifier.check(keys.mk, USER, fromBase64(keys.mk_verifier))).toBe(true);
  });

  it('the Admin phone verifies the sealed wrap before approving (AC-10)', () => {
    const keys = createMemberKeys(kek, USER, pubB64);
    const material = {
      user_id: USER,
      mk_wrapped_admin: keys.mk_wrapped_admin,
      mk_verifier: keys.mk_verifier,
    };
    expect(verifyMemberWrap(admin.secretKey, material)).toEqual(keys.mk);
  });

  it('a tampered wrap, a wrong verifier or another recovery key is refused (AC-10)', () => {
    const keys = createMemberKeys(kek, USER, pubB64);
    const other = createMemberKeys(kek, USER, pubB64);
    const wrong = recovery.deriveRecoveryKeypair(new Uint8Array(32).fill(9));
    const base = {
      user_id: USER,
      mk_wrapped_admin: keys.mk_wrapped_admin,
      mk_verifier: keys.mk_verifier,
    };
    const tampered = fromBase64(keys.mk_wrapped_admin);
    tampered[40] = (tampered[40] ?? 0) ^ 1;
    expect(
      verifyMemberWrap(admin.secretKey, { ...base, mk_wrapped_admin: toBase64(tampered) }),
    ).toBeNull();
    expect(
      verifyMemberWrap(admin.secretKey, { ...base, mk_verifier: other.mk_verifier }),
    ).toBeNull();
    expect(verifyMemberWrap(wrong.secretKey, base)).toBeNull();
    expect(verifyMemberWrap(admin.secretKey, { ...base, user_id: 'someone-else' })).toBeNull();
  });
});
