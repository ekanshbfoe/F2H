import { normalizeEmail, passwordSplit, passwordSplitSync } from '../password-split';
import { hex, vectors } from './helpers';

const v = vectors.passwordSplit;

describe('password split (AC-6)', () => {
  it('reproduces the vector: 43 char base64url auth secret and a 32 byte KEK', async () => {
    const split = await passwordSplit(v.email, v.password);
    expect(split.authSecret).toBe(v.authSecret);
    expect(split.authSecret).toHaveLength(43);
    expect(split.authSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(split.kek).toHaveLength(32);
    expect(hex(split.kek)).toBe(v.kek);
  });

  it('is deterministic and ignores email casing and surrounding whitespace', () => {
    const a = passwordSplitSync('father@example.com', v.password);
    const b = passwordSplitSync('  FATHER@example.COM ', v.password);
    expect(a).toEqual(b);
    expect(normalizeEmail(' Mother@Example.com ')).toBe('mother@example.com');
  });

  it('changes completely with a different password or email', () => {
    const base = passwordSplitSync(v.email, v.password);
    const otherPassword = passwordSplitSync(v.email, `${v.password}!`);
    const otherEmail = passwordSplitSync('mother@example.com', v.password);
    expect(otherPassword.authSecret).not.toBe(base.authSecret);
    expect(otherEmail.authSecret).not.toBe(base.authSecret);
    expect(otherPassword.kek).not.toEqual(base.kek);
  });

  it('never lets the auth secret and the KEK share bytes', () => {
    const split = passwordSplitSync(v.email, v.password);
    expect(split.authSecret).not.toContain(hex(split.kek).slice(0, 8));
  });
});
