import { z } from 'zod';

export const PASSWORD_MIN = 10;
export const INVITE_LENGTH = 8;

const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const password = z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`);

export const loginSchema = z.object({
  email,
  password,
  deviceName: z.string().trim().max(60).optional(),
});
export type LoginForm = z.infer<typeof loginSchema>;

/** Crockford base32 without the look alike letters I, L, O, U; shown uppercase with no separators. */
export function normalizeInviteCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export const signupSchema = z
  .object({
    displayName: z.string().trim().min(2, 'Tell the family who you are').max(40),
    email,
    inviteCode: z
      .string()
      .transform(normalizeInviteCode)
      .refine((v) => v.length === INVITE_LENGTH, `The invite code is ${INVITE_LENGTH} characters`),
    password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });
export type SignupForm = z.infer<typeof signupSchema>;

export const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });
export type NewPasswordForm = z.infer<typeof newPasswordSchema>;

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password'),
    password,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });
export type ChangePasswordForm = z.infer<typeof changePasswordSchema>;
