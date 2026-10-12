import {
  box,
  envelope,
  fromBase64,
  passwordSplit,
  SCRYPT_DEFAULT,
  toBase64,
  verifier,
  zero,
} from '@/crypto';
import {
  buildDevicePayload,
  deviceSecretKey,
  registerDevice,
  type Registration,
} from '@/features/device/register';
import { createMemberKeys } from '@/features/keyring/bootstrap';
import { unlockWithKek } from '@/features/keyring/unlock';
import { checkDeviceStatus, loadLockState } from '@/features/lock/api';
import { useLock } from '@/features/lock/lock.store';
import { forgetPin, hasPinFor } from '@/features/lock/storage';
import { AppKeys, appDelete } from '@/services/app-storage';
import { eraseItemCache } from '@/services/item-cache';
import { callFunction, FunctionError } from '@/services/functions';
import { SecureKeys, secureDelete, secureGet, secureSet } from '@/services/secure-store';
import { getDeviceToken, loadDeviceToken, setDeviceToken, supabase } from '@/services/supabase';
import { useSession, type SessionProfile } from '@/state/session.store';

import type { LoginForm, SignupForm } from './model';
import { adminNeedsFirstRun, loadProfile, readCachedProfile, wipeLocalState } from './session';

export { wipeLocalState } from './session';

export type AuthRoute =
  | 'login'
  | 'waiting'
  | 'rejected'
  | 'expired'
  | 'recovery-kit'
  | 'recovery-words'
  | 'recovered'
  | 'home'
  | 'unlock'
  | 'set-pin'
  | 'wiped';

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

/**
 * Decides the first screen on boot. A phone with a PIN wrap shows the Unlock gate before anything
 * touches the network (AC-2 of spec 0002); without one, secrets never survive a cold start, so an
 * approved device goes back to login.
 */
export async function resolveBootRoute(): Promise<AuthRoute> {
  const s = useSession.getState();
  await loadDeviceToken();
  const lock = await loadLockState();
  if (lock === 'wiped') return 'wiped';
  if (lock === 'locked') return 'unlock';
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

/**
 * After the PIN opened the vault on a cold start: now the session and the device status are
 * checked (AC-2, AC-10 of spec 0002). No session, or a session for another account than the
 * wrap's owner, forgets the PIN and goes to login; a closed device status wipes.
 */
export async function resolveAfterUnlock(): Promise<AuthRoute> {
  const s = useSession.getState();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const owner = await secureGet(SecureKeys.lockOwner);
  const profile = session
    ? ((await loadProfile(session.user.id)) ?? (await readCachedProfile(session.user.id)))
    : null;
  if (!session || session.user.id !== owner || !profile) {
    await forgetPin();
    useLock.getState().set({ state: 'no_pin' });
    s.reset('signed_out');
    return 'login';
  }
  s.setProfile(profile);
  s.setDevice(await secureGet(SecureKeys.deviceId), null);
  s.setPhase('ready');
  await checkDeviceStatus().catch(() => undefined);
  return useLock.getState().state === 'wiped' ? 'wiped' : 'home';
}

/** After the Master Key is in memory: a phone without a PIN for this account sets one first (AC-1). */
export async function routeWithKey(profile: SessionProfile): Promise<AuthRoute> {
  const pinned = await hasPinFor(profile.id);
  useLock.getState().set({ state: pinned ? 'unlocked' : 'no_pin', failures: 0, cooldownMs: 0 });
  return pinned ? 'home' : 'set-pin';
}

/** Continues after a password login or an approval: unwrap, then first run, Set PIN or home (AC-12). */
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
  return routeWithKey(profile);
}

/** Names the exact call and status so a red banner says which hop failed. */
function functionFailure(name: string, e: FunctionError): AuthError {
  if (e.status === 0) return new AuthError('network', name + ': ' + e.code + ' (no HTTP response)');
  return new AuthError(
    'function_failed',
    name + ': ' + e.code + ' (HTTP ' + String(e.status) + ')',
  );
}

export class AuthError extends Error {
  constructor(
    readonly code:
      | 'bad_credentials'
      | 'bad_invite'
      | 'email_exists'
      | 'no_recovery_key'
      | 'network'
      | 'account_created'
      | 'auth_unreachable'
      | 'function_failed'
      | 'profile_missing'
      | 'unknown',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AuthError';
  }
}

/**
 * A phone that already holds a device token resumes that device (approved or still pending)
 * instead of registering again: registration is a one time event per install. A closed or
 * unknown device forgets its local identity so a fresh registration can start.
 */
async function resumeExistingDevice(): Promise<Registration | null> {
  const storedId = await secureGet(SecureKeys.deviceId);
  const token = getDeviceToken() ?? (await loadDeviceToken());
  if (!storedId || !token) return null;
  const { data, error } = await supabase
    .from('devices')
    .select('status')
    .eq('id', storedId)
    .maybeSingle();
  // A transient error or an invisible row never wipes anything: registration's nonce guard decides.
  if (error || !data) return null;
  if (data.status === 'approved' || data.status === 'pending') {
    return { deviceId: storedId, status: data.status };
  }
  // Definitively closed (rejected, expired, revoked): forget the identity so a fresh one can start.
  await setDeviceToken(null);
  await secureDelete(SecureKeys.deviceId);
  await secureDelete(SecureKeys.registrationNonce);
  return null;
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
    if (error?.status === 400) throw new AuthError('bad_credentials', error.message);
    throw new AuthError(
      'auth_unreachable',
      'Supabase Auth signInWithPassword: status ' +
        String(error?.status ?? 'none') +
        ', ' +
        (error?.message ?? 'no response'),
    );
  }
  const profile = await loadProfile(data.user.id);
  if (!profile) throw new AuthError('profile_missing');
  s.setProfile(profile);
  let registration: Registration | null = await resumeExistingDevice();
  if (!registration) {
    try {
      // The Admin's new phone may take over a foreign pending slot of their own account.
      registration = await registerDevice(false, { replacePending: profile.role === 'admin' });
    } catch (e) {
      zero(split.kek);
      if (e instanceof FunctionError) throw functionFailure('register-device', e);
      throw e;
    }
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
      throw functionFailure('signup', e);
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
  if (error) {
    zero(split.kek);
    throw new AuthError('account_created', error.message);
  }
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

/**
 * Ends the session, drops every secret from memory and forgets the PIN (AC-14 of spec 0002). The
 * device token, id and nonce stay: this phone remains an approved device until the Admin revokes
 * it or a rejection wipes it, so the next login resumes it instead of registering again.
 */
export async function signOut(): Promise<void> {
  const s = useSession.getState();
  s.clearSecrets();
  useLock.getState().bumpGeneration();
  await forgetPin();
  await Promise.all([
    appDelete(AppKeys.backgroundAt),
    appDelete(AppKeys.profile),
    appDelete(AppKeys.adminApprovedCount),
    eraseItemCache(),
  ]);
  await supabase.auth.signOut().catch(() => undefined);
  s.reset('signed_out');
  useLock.getState().set({ state: 'no_pin', failures: 0, cooldownMs: 0, busy: false });
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
  const wrapped = toBase64(envelope.wrapMk(next.kek, mk, profile.id));
  zero(next.kek);
  const { error } = await supabase.auth.updateUser({ password: next.authSecret });
  if (error) throw new AuthError('network', error.message);
  const { error: kmError } = await supabase
    .from('key_material')
    .update({ mk_wrapped_pw: wrapped, updated_by_device: s.deviceId })
    .eq('user_id', profile.id);
  if (kmError) {
    // Put the old password back so the member is never locked out by a half applied change.
    const rollback = await supabase.auth.updateUser({ password: current.authSecret });
    throw new AuthError(
      'network',
      rollback.error
        ? `wrap failed and rollback failed: ${kmError.message}; use the Admin recovery path`
        : `wrap failed, password unchanged: ${kmError.message}`,
    );
  }
}

/** The waiting phone closes its own request so the Admin's list and the server agree (AC-13). */
export async function cancelMyRequest(): Promise<void> {
  const deviceId = useSession.getState().deviceId;
  if (deviceId) await supabase.rpc('cancel_my_device', { p_device_id: deviceId });
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
  try {
    // Prove the unsealed key before anything is persisted under it.
    const { data: km } = await supabase
      .from('key_material')
      .select('mk_verifier')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!km || !verifier.check(mk, user.id, fromBase64(km.mk_verifier))) {
      throw new AuthError('unknown', 'the recovery grant does not match this account');
    }
    const next = await passwordSplit(user.email, newPassword);
    const wrapped = toBase64(envelope.wrapMk(next.kek, mk, user.id));
    zero(next.kek);
    await callFunction('reset-password', {
      grant_id: grant.id,
      new_auth_secret: next.authSecret,
      new_mk_wrapped_pw: wrapped,
    });
  } catch (error) {
    zero(mk);
    throw error;
  }
  const profile = await loadProfile(user.id);
  if (profile) s.setProfile(profile);
  s.setMk(mk);
  s.setPhase('ready');
  return profile ? routeWithKey(profile) : 'home';
}
