import { box, envelope, fromBase64, passwordSplit, SCRYPT_DEFAULT, toBase64, zero } from '@/crypto';
import { buildDevicePayload, deviceSecretKey, registerDevice } from '@/features/device/register';
import { createMemberKeys } from '@/features/keyring/bootstrap';
import { unlockWithKek } from '@/features/keyring/unlock';
import { callFunction, FunctionError } from '@/services/functions';
import { SecureKeys, secureGet, secureSet, secureWipe } from '@/services/secure-store';
import { loadDeviceToken, setDeviceToken, supabase } from '@/services/supabase';
import { useSession, type SessionProfile } from '@/state/session.store';

import type { LoginForm, SignupForm } from './model';

export type AuthRoute = 'login' | 'waiting' | 'rejected' | 'expired' | 'recovery-kit' | 'home';

/** The Admin recovery public key the signup screen seals the new MK to, plus its fingerprint. */
export async function fetchRecoveryPubkey(): Promise<{
  recovery_pub: string;
  fingerprint: string;
} | null> {
  const { data, error } = await supabase.rpc('recovery_pubkey');
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as
    { recovery_pub: string; fingerprint: string } | undefined;
  return row ?? null;
}

async function loadProfile(userId: string): Promise<SessionProfile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, email, display_name, role, status')
    .eq('id', userId)
    .maybeSingle();
  return data ?? null;
}

async function adminNeedsFirstRun(profile: SessionProfile): Promise<boolean> {
  if (profile.role !== 'admin') return false;
  const { data } = await supabase
    .from('family_config')
    .select('admin_recovery_pubkey')
    .eq('id', 1)
    .maybeSingle();
  return !data?.admin_recovery_pubkey;
}

/**
 * Decides the first screen on boot. Secrets never survive a cold start (the App lock feature adds
 * the PIN path), so an approved device without a Master Key in memory goes back to login.
 */
export async function resolveBootRoute(): Promise<AuthRoute> {
  const s = useSession.getState();
  await loadDeviceToken();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) {
    s.reset('signed_out');
    return 'login';
  }
  const profile = await loadProfile(session.user.id);
  if (!profile) {
    s.reset('signed_out');
    return 'login';
  }
  s.setProfile(profile);
  const deviceId = await secureGet(SecureKeys.deviceId);
  if (!deviceId) {
    s.setPhase('signed_out');
    return 'login';
  }
  const { data: device } = await supabase
    .from('devices')
    .select('status')
    .eq('id', deviceId)
    .maybeSingle();
  const status = device?.status ?? null;
  s.setDevice(deviceId, status);
  if (status === 'pending') {
    s.setPhase('pending');
    return 'waiting';
  }
  if (status === 'rejected' || status === 'expired' || status === 'revoked') {
    await wipeLocalState(status === 'expired' ? 'expired' : 'rejected');
    return status === 'expired' ? 'expired' : 'rejected';
  }
  if (s.mk) {
    if (await adminNeedsFirstRun(profile)) {
      s.setPhase('first_run');
      return 'recovery-kit';
    }
    s.setPhase('ready');
    return 'home';
  }
  s.setPhase('signed_out');
  return 'login';
}

/** Continues after a password login or an approval: unwrap, then first run or home (AC-12). */
async function continueApproved(kek: Uint8Array, profile: SessionProfile): Promise<AuthRoute> {
  const s = useSession.getState();
  if (await adminNeedsFirstRun(profile)) {
    s.setKek(kek);
    s.setPhase('first_run');
    return 'recovery-kit';
  }
  const mk = await unlockWithKek(kek, profile.id);
  s.setMk(mk);
  s.setKek(null);
  s.setPhase('ready');
  return 'home';
}

export class AuthError extends Error {
  constructor(
    readonly code:
      | 'bad_credentials'
      | 'bad_invite'
      | 'email_exists'
      | 'no_recovery_key'
      | 'network'
      | 'profile_missing'
      | 'unknown',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AuthError';
  }
}

/** Password login on this phone, then device registration (AC-6, AC-12). */
export async function signIn(form: LoginForm): Promise<AuthRoute> {
  const s = useSession.getState();
  const split = await passwordSplit(form.email, form.password);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: form.email,
    password: split.authSecret,
  });
  if (error || !data.user) {
    zero(split.kek);
    throw new AuthError(error?.status === 400 ? 'bad_credentials' : 'network', error?.message);
  }
  const profile = await loadProfile(data.user.id);
  if (!profile) throw new AuthError('profile_missing');
  s.setProfile(profile);
  let registration;
  try {
    registration = await registerDevice();
  } catch (e) {
    zero(split.kek);
    throw e instanceof FunctionError ? new AuthError('network', e.code) : e;
  }
  s.setDevice(registration.deviceId, registration.status);
  if (form.deviceName) {
    await supabase
      .from('devices')
      .update({ name: form.deviceName })
      .eq('id', registration.deviceId);
  }
  if (registration.status === 'approved') return continueApproved(split.kek, profile);
  s.setKek(split.kek);
  s.setPhase('pending');
  return 'waiting';
}

/** Invite code signup: keys are made here, the vault half of the password never leaves (AC-2, AC-3). */
export async function signUp(form: SignupForm): Promise<AuthRoute> {
  const s = useSession.getState();
  const recovery = await fetchRecoveryPubkey();
  if (!recovery) throw new AuthError('no_recovery_key');
  const split = await passwordSplit(form.email, form.password);
  const { device, nonce } = await buildDevicePayload();
  // The wraps bind to the user id (AAD), so the phone picks the id and the server creates the
  // auth user with it. Keys are made before the account exists; a failed signup zeroes them.
  const userId = randomUserId();
  const keys = createMemberKeys(split.kek, userId, recovery.recovery_pub);
  let res: { user_id: string; device_id: string; device_token: string };
  try {
    res = await callFunction('signup', {
      user_id: userId,
      email: form.email,
      auth_secret: split.authSecret,
      invite_code: form.inviteCode,
      display_name: form.displayName,
      kdf_params: SCRYPT_DEFAULT,
      mk_wrapped_pw: keys.mk_wrapped_pw,
      mk_wrapped_admin: keys.mk_wrapped_admin,
      mk_verifier: keys.mk_verifier,
      device: { ...device, nonce },
    });
  } catch (e) {
    zero(split.kek);
    zero(keys.mk);
    if (e instanceof FunctionError) {
      if (e.code === 'bad_invite') throw new AuthError('bad_invite');
      if (e.code === 'email_exists') throw new AuthError('email_exists');
      throw new AuthError(e.status === 0 ? 'network' : 'unknown', e.code);
    }
    throw e;
  }
  zero(keys.mk);
  await setDeviceToken(res.device_token);
  await secureSet(SecureKeys.deviceId, res.device_id);
  const { error } = await supabase.auth.signInWithPassword({
    email: form.email,
    password: split.authSecret,
  });
  if (error) throw new AuthError('network', error.message);
  const profile = await loadProfile(res.user_id);
  if (profile) s.setProfile(profile);
  s.setDevice(res.device_id, 'pending');
  s.setKek(split.kek);
  s.setPhase('pending');
  return 'waiting';
}

function randomUserId(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Called by the waiting screen when the row flips to approved. */
export async function completeApproval(): Promise<AuthRoute> {
  const s = useSession.getState();
  const { profile, kek } = s;
  if (!profile || !kek) return 'login';
  const fresh = (await loadProfile(profile.id)) ?? profile;
  s.setProfile(fresh);
  return continueApproved(kek, fresh);
}

/** Rejected, expired or revoked: wipe local key material and the token (AC-13). */
export async function wipeLocalState(phase: 'rejected' | 'expired' | 'signed_out' = 'signed_out') {
  const s = useSession.getState();
  await secureWipe();
  await setDeviceToken(null);
  await supabase.auth.signOut().catch(() => undefined);
  s.reset(phase);
}

export async function signOut(): Promise<void> {
  const s = useSession.getState();
  s.clearSecrets();
  await setDeviceToken(null);
  await supabase.auth.signOut().catch(() => undefined);
  s.reset('signed_out');
}

/** Change password while unlocked (AC-16): new split, new auth password, new password wrap. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const s = useSession.getState();
  const { profile, mk } = s;
  if (!profile || !mk) throw new AuthError('unknown', 'not unlocked');
  const current = await passwordSplit(profile.email, currentPassword);
  zero(current.kek);
  const check = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: current.authSecret,
  });
  if (check.error) throw new AuthError('bad_credentials');
  const next = await passwordSplit(profile.email, newPassword);
  const { error } = await supabase.auth.updateUser({ password: next.authSecret });
  if (error) {
    zero(next.kek);
    throw new AuthError('network', error.message);
  }
  const wrapped = toBase64(envelope.wrapMk(next.kek, mk, profile.id));
  zero(next.kek);
  const { error: kmError } = await supabase
    .from('key_material')
    .update({ mk_wrapped_pw: wrapped, updated_by_device: s.deviceId })
    .eq('user_id', profile.id);
  if (kmError) throw new AuthError('network', kmError.message);
}

export interface MyGrant {
  id: string;
  expires_at: string;
  mk_sealed_for_device: string;
}

/** The unconsumed grant the Admin issued for this device, if any (AC-15). */
export async function fetchMyGrant(): Promise<MyGrant | null> {
  const { data } = await supabase
    .from('recovery_grants')
    .select('id, expires_at, mk_sealed_for_device')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Redeems the grant: unseal the MK with this device's key, set a new password, rewrap. */
export async function redeemGrant(grant: MyGrant, newPassword: string): Promise<AuthRoute> {
  const s = useSession.getState();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) throw new AuthError('unknown', 'no session');
  const secret = await deviceSecretKey();
  if (!secret) throw new AuthError('unknown', 'no device key');
  let mk: Uint8Array;
  try {
    mk = box.open(secret, fromBase64(grant.mk_sealed_for_device));
  } finally {
    zero(secret);
  }
  const next = await passwordSplit(user.email, newPassword);
  const wrapped = toBase64(envelope.wrapMk(next.kek, mk, user.id));
  zero(next.kek);
  await callFunction('reset-password', {
    grant_id: grant.id,
    new_auth_secret: next.authSecret,
    new_mk_wrapped_pw: wrapped,
  });
  const profile = await loadProfile(user.id);
  if (profile) s.setProfile(profile);
  s.setMk(mk);
  s.setPhase('ready');
  return 'home';
}
