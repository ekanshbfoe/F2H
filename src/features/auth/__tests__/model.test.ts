// covers: AC-1 (on device validation: email, 10 char password, matching confirm, 8 char invite)
import { changePasswordSchema, loginSchema, normalizeInviteCode, signupSchema } from '../model';
import { describeAuthError, pathFor } from '../routes';

describe('login form', () => {
  it('accepts a valid email and a 10 char password, lowercasing the email', () => {
    const r = loginSchema.safeParse({ email: ' Father@Example.com ', password: 'abcdefghij' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('father@example.com');
  });

  it('rejects an invalid email and a short password with field messages', () => {
    const r = loginSchema.safeParse({ email: 'nope', password: 'short' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'));
      expect(paths).toEqual(expect.arrayContaining(['email', 'password']));
    }
  });
});

describe('signup form', () => {
  const valid = {
    displayName: 'Brother',
    email: 'brother@example.com',
    inviteCode: 'ab12-cd34',
    password: 'correct horse',
    confirm: 'correct horse',
  };

  it('normalizes the invite code to 8 uppercase Crockford characters', () => {
    const r = signupSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.inviteCode).toBe('AB12CD34');
    expect(normalizeInviteCode('ol1i-ab')).toBe('0111AB');
  });

  it('rejects a mismatched confirm on the confirm field', () => {
    const r = signupSchema.safeParse({ ...valid, confirm: 'different pw' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['confirm']);
  });

  it('rejects a code that is not 8 characters and a name that is too short', () => {
    const r = signupSchema.safeParse({ ...valid, inviteCode: 'ABC', displayName: 'B' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'));
      expect(paths).toEqual(expect.arrayContaining(['inviteCode', 'displayName']));
    }
  });
});

describe('change password form', () => {
  it('requires the current password and a matching new pair', () => {
    expect(
      changePasswordSchema.safeParse({ current: '', password: 'abcdefghij', confirm: 'abcdefghij' })
        .success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        current: 'x',
        password: 'abcdefghij',
        confirm: 'abcdefghij',
      }).success,
    ).toBe(true);
  });
});

describe('routes and error copy', () => {
  it('maps every gate outcome to a screen', () => {
    expect(pathFor('login')).toBe('/(auth)/login');
    expect(pathFor('waiting')).toBe('/(auth)/waiting');
    expect(pathFor('rejected')).toContain('reason=rejected');
    expect(pathFor('expired')).toContain('reason=expired');
    expect(pathFor('recovery-kit')).toBe('/(admin)/recovery-kit');
    expect(pathFor('home')).toBe('/(app)/home');
  });

  it('explains known error codes and falls back for unknown ones', () => {
    expect(describeAuthError({ code: 'bad_invite' })).toMatch(/invite code/);
    expect(describeAuthError({ code: 'bad_credentials' })).toMatch(/do not match/);
    expect(describeAuthError(new Error('boom'))).toMatch(/Something went wrong/);
  });
});
