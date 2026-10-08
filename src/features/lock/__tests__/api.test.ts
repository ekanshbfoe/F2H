// covers: AC-12 (state machine, backoff, restart resume, wipe at ten, owner binding, generation
// guard, PIN wrap round trip against the crypto vectors), AC-13 (parallel reads), AC-14 (forget),
// AC-16 (withKey)
import { fromBase64, fromHex, localWrap, toBase64 } from '@/crypto';
import vectors from '@/crypto/__tests__/vectors.json';
import { useSession } from '@/state/session.store';
import {
  changePin,
  loadLockState,
  lockNow,
  LockError,
  persistCooldown,
  setPin,
  unlock,
  wipe,
  withKey,
} from '../api';
import { monotonicNow, useLock } from '../lock.store';
import { forgetPin, readAttempts } from '../storage';

const mockSecure = new Map<string, string>();
const mockApp = new Map<string, string>();
const mockRpc = jest.fn(async () => ({ data: 'revoked', error: null }));
const mockDevices: { status: string }[] = [];
const mockSignOut = jest.fn(async () => ({ error: null }));

jest.mock('@/services/secure-store', () => {
  const SecureKeys = {
    deviceToken: 'f2h.device_token',
    deviceId: 'f2h.device_id',
    deviceSecret: 'f2h.device_secret',
    deviceSalt: 'f2h.device_salt',
    mkWrappedLocal: 'f2h.mk_wrapped_local',
    mkWrappedBio: 'f2h.mk_wrapped_bio',
    lockOwner: 'f2h.lock_owner',
    lockAttempts: 'f2h.lock_attempts',
    deviceKey: 'f2h.device_key',
    registrationNonce: 'f2h.registration_nonce',
    recoveryItemId: 'f2h.recovery_item_id',
  };
  return {
    SecureKeys,
    secureGet: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
    secureSet: jest.fn(async (k: string, v: string) => {
      mockSecure.set(k, v);
    }),
    secureDelete: jest.fn(async (k: string) => {
      mockSecure.delete(k);
    }),
    secureWipe: jest.fn(async () => mockSecure.clear()),
  };
});
jest.mock('@/services/app-storage', () => ({
  AppKeys: {
    lockTimeoutMs: 'f2h.lock_timeout_ms',
    backgroundAt: 'f2h.background_at',
    profile: 'f2h.profile',
  },
  appGet: jest.fn(async (k: string) => mockApp.get(k) ?? null),
  appSet: jest.fn(async (k: string, v: string) => {
    mockApp.set(k, v);
  }),
  appDelete: jest.fn(async (k: string) => {
    mockApp.delete(k);
  }),
}));
jest.mock('@/services/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...(args as [])),
    auth: { signOut: () => mockSignOut() },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mockDevices[0] ?? null, error: null }) }),
      }),
    }),
  },
  setDeviceToken: jest.fn(async () => undefined),
}));

const PIN = vectors.localWrap.pin;
const OWNER = vectors.verifier.userId;
const mkBytes = () => fromHex(vectors.envelope.mk);

function signedIn(owner = OWNER) {
  const s = useSession.getState();
  s.setProfile({ id: owner, email: 'a@x', display_name: 'A', role: 'member', status: 'active' });
  s.setMk(mkBytes());
  s.setDevice('dev-1', 'approved');
  s.setPhase('ready');
}

beforeEach(() => {
  mockSecure.clear();
  mockApp.clear();
  mockDevices.length = 0;
  mockRpc.mockClear();
  mockSignOut.mockClear();
  useSession.getState().reset('signed_out');
  useLock.setState({
    state: 'no_pin',
    generation: 0,
    failures: 0,
    cooldownMs: 0,
    cooldownStartedAt: 0,
    wipeReason: null,
    busy: false,
  });
  mockSecure.set('f2h.device_id', 'dev-1');
  mockSecure.set('f2h.device_token', 'dG9r');
  mockSecure.set('f2h.device_salt', toBase64(fromHex(vectors.localWrap.deviceSalt)));
  mockSecure.set('f2h.device_secret', toBase64(fromHex(vectors.localWrap.deviceSecret)));
});

describe('set PIN and unlock (AC-1, AC-2)', () => {
  it('wraps the key under the vector wrap key and unlocks it again', async () => {
    signedIn();
    await setPin(PIN);
    expect(mockSecure.get('f2h.lock_owner')).toBe(OWNER);
    expect(useLock.getState().state).toBe('unlocked');
    // The stored wrap opens with the vector's wrap key, so a native swap must match it bit for bit.
    const wrapKey = fromHex(vectors.localWrap.wrapKey);
    const wire = fromBase64(mockSecure.get('f2h.mk_wrapped_local') ?? '');
    expect(localWrap.unwrapMkLocal(wrapKey, wire, OWNER)).toEqual(mkBytes());

    lockNow();
    expect(useSession.getState().mk).toBeNull();
    expect(useLock.getState().state).toBe('locked');
    expect(useLock.getState().generation).toBe(1);

    await expect(unlock(PIN)).resolves.toEqual({ kind: 'ok' });
    expect(useSession.getState().mk).toEqual(mkBytes());
    expect(useLock.getState().state).toBe('unlocked');
    await expect(readAttempts()).resolves.toEqual({ failures: 0, remainingMs: 0 });
  });

  it('refuses a weak PIN before deriving anything', async () => {
    signedIn();
    await expect(setPin('123456')).rejects.toMatchObject({ code: 'weak_pin', problem: 'sequence' });
    expect(mockSecure.has('f2h.mk_wrapped_local')).toBe(false);
    expect(useLock.getState().state).toBe('no_pin');
  });

  it('needs the key in memory', async () => {
    await expect(setPin(PIN)).rejects.toMatchObject({ code: 'not_unlocked' });
  });

  it('a wrap made for another account never opens (AC-14 owner binding)', async () => {
    signedIn('other-user');
    await setPin(PIN);
    mockSecure.set('f2h.lock_owner', OWNER);
    lockNow();
    await expect(unlock(PIN)).resolves.toEqual({ kind: 'wrong_pin', failures: 1 });
  });
});

describe('attempt gate (AC-4, AC-5)', () => {
  beforeEach(async () => {
    signedIn();
    await setPin(PIN);
    lockNow();
  });

  it('misses 1 to 4 are free, the fifth starts a 30 s wait that blocks guesses', async () => {
    for (let n = 1; n <= 4; n += 1) {
      await expect(unlock('000000')).resolves.toEqual({ kind: 'wrong_pin', failures: n });
    }
    await expect(unlock('000000')).resolves.toEqual({ kind: 'cooling_down', remainingMs: 30_000 });
    expect(useLock.getState().state).toBe('cooling_down');
    await expect(readAttempts()).resolves.toEqual({ failures: 5, remainingMs: 30_000 });
    // While cooling down even the right PIN is not tried and the entry is untouched.
    const r = await unlock(PIN);
    expect(r.kind).toBe('cooling_down');
    await expect(readAttempts()).resolves.toEqual({ failures: 5, remainingMs: 30_000 });
    expect(useSession.getState().mk).toBeNull();
  });

  it('writes the miss before the derivation so a kill still costs the guess', async () => {
    const { secureSet } = jest.requireMock('@/services/secure-store') as {
      secureSet: jest.Mock;
    };
    secureSet.mockClear();
    await unlock('000000');
    const first = secureSet.mock.calls[0] as [string, string];
    expect(first[0]).toBe('f2h.lock_attempts');
    expect(JSON.parse(first[1])).toEqual({ failures: 1, remainingMs: 0 });
  });

  it('a restart resumes the full remaining wait', async () => {
    mockSecure.set('f2h.lock_attempts', JSON.stringify({ failures: 6, remainingMs: 45_000 }));
    await expect(loadLockState()).resolves.toBe('locked');
    const lock = useLock.getState();
    expect(lock.state).toBe('cooling_down');
    expect(lock.failures).toBe(6);
    expect(lock.cooldownMs).toBe(45_000);
    await persistCooldown();
    const persisted = await readAttempts();
    expect(persisted.failures).toBe(6);
    expect(persisted.remainingMs).toBeLessThanOrEqual(45_000);
    expect(persisted.remainingMs).toBeGreaterThan(44_000);
  });

  it('a stored tenth miss wipes on boot, telling the server first', async () => {
    mockSecure.set('f2h.lock_attempts', JSON.stringify({ failures: 10, remainingMs: 0 }));
    await expect(loadLockState()).resolves.toBe('wiped');
    expect(mockRpc).toHaveBeenCalledWith('revoke_my_device', { p_device_id: 'dev-1' });
    expect(mockSecure.size).toBe(0);
    expect(useLock.getState()).toMatchObject({ state: 'wiped', wipeReason: 'pin_limit' });
    expect(useSession.getState().phase).toBe('signed_out');
  });

  it('the tenth wrong PIN wipes; a correct tenth guess resets', async () => {
    mockSecure.set('f2h.lock_attempts', JSON.stringify({ failures: 9, remainingMs: 0 }));
    await expect(unlock(PIN)).resolves.toEqual({ kind: 'ok' });
    await expect(readAttempts()).resolves.toEqual({ failures: 0, remainingMs: 0 });

    lockNow();
    mockSecure.set('f2h.lock_attempts', JSON.stringify({ failures: 9, remainingMs: 0 }));
    await expect(unlock('000000')).resolves.toEqual({ kind: 'wiped' });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockSecure.has('f2h.mk_wrapped_local')).toBe(false);
    expect(mockSecure.has('f2h.device_token')).toBe(false);
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('forgot PIN wipes with its own reason and skips nothing', async () => {
    await wipe('forgot');
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(useLock.getState().wipeReason).toBe('forgot');
    expect(mockSecure.size).toBe(0);
  });

  it('a revoke from the server wipes without calling the RPC', async () => {
    await wipe('revoked');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(useLock.getState().wipeReason).toBe('revoked');
  });
});

describe('generation guard (AC-16)', () => {
  it('drops an unlock result when a wipe happened during the derivation', async () => {
    signedIn();
    await setPin(PIN);
    lockNow();
    const pending = unlock(PIN);
    useLock.getState().bumpGeneration();
    await expect(pending).resolves.toEqual({ kind: 'stale' });
    expect(useSession.getState().mk).toBeNull();
  });

  it('withKey works on a copy and aborts a commit after a lock', async () => {
    signedIn();
    await setPin(PIN);
    const original = mkBytes();
    const seen: Uint8Array[] = [];
    await withKey(async (mk, assertLive) => {
      seen.push(mk);
      expect(mk).toEqual(original);
      expect(mk).not.toBe(useSession.getState().mk);
      assertLive();
    });
    expect(seen[0]?.every((b) => b === 0)).toBe(true);
    await expect(
      withKey(async (_mk, assertLive) => {
        lockNow();
        assertLive();
      }),
    ).rejects.toMatchObject({ code: 'locked' });
    await expect(withKey(async () => 1)).rejects.toBeInstanceOf(LockError);
  });
});

describe('change PIN (AC-7) and sign out (AC-14)', () => {
  it('gates on the current PIN and rewraps without touching salt or secret', async () => {
    signedIn();
    await setPin(PIN);
    const salt = mockSecure.get('f2h.device_salt');
    const secret = mockSecure.get('f2h.device_secret');
    await expect(changePin('000000', '246810')).resolves.toEqual({
      kind: 'wrong_pin',
      failures: 1,
    });
    await expect(changePin(PIN, '246810')).resolves.toEqual({ kind: 'ok' });
    expect(mockSecure.get('f2h.device_salt')).toBe(salt);
    expect(mockSecure.get('f2h.device_secret')).toBe(secret);
    lockNow();
    await expect(unlock(PIN)).resolves.toMatchObject({ kind: 'wrong_pin' });
    await expect(unlock('246810')).resolves.toEqual({ kind: 'ok' });
  });

  it('a run of wrong current PINs locks the open phone', async () => {
    signedIn();
    await setPin(PIN);
    mockSecure.set('f2h.lock_attempts', JSON.stringify({ failures: 4, remainingMs: 0 }));
    await expect(changePin('000000', '246810')).resolves.toMatchObject({ kind: 'cooling_down' });
    expect(useLock.getState().state).toBe('cooling_down');
    expect(useSession.getState().mk).toBeNull();
  });

  it('forgetPin removes the wrap, attempts and owner but keeps the device identity', async () => {
    signedIn();
    await setPin(PIN);
    await forgetPin();
    expect(mockSecure.has('f2h.mk_wrapped_local')).toBe(false);
    expect(mockSecure.has('f2h.lock_attempts')).toBe(false);
    expect(mockSecure.has('f2h.lock_owner')).toBe(false);
    expect(mockSecure.get('f2h.device_id')).toBe('dev-1');
    expect(mockSecure.get('f2h.device_token')).toBe('dG9r');
    expect(mockSecure.has('f2h.device_secret')).toBe(true);
  });

  it('monotonic time never goes backwards within a run', () => {
    const a = monotonicNow();
    const b = monotonicNow();
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
