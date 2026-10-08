// covers: AC-2 (one burst, the tag the phone sends is the vector tag), AC-3 (local word checks),
// AC-5 (outcome mapping: expired re-issues, wrong retries once then reports, rejected)
import { fromHex, mnemonic, toBase64 } from '@/crypto';
import vectors from '@/crypto/__tests__/vectors.json';
import { FunctionError } from '@/services/functions';
import { useSession } from '@/state/session.store';

import { checkRecoveryWords, selfApprove } from '../self-approve';

const v = vectors.adminChallenge;
const RECOVERY_PUB_B64 = toBase64(fromHex(v.recoveryPub));
const WORDS = mnemonic.fromSeed(fromHex(vectors.recovery.seed));

const mockCall = jest.fn<Promise<unknown>, [string, Record<string, unknown>]>();
const mockFetchPub = jest.fn(async () => ({ recovery_pub: RECOVERY_PUB_B64, fingerprint: 'x' }));

jest.mock('@/services/functions', () => {
  class FunctionError extends Error {
    status: number;
    code: string;
    payload: Record<string, unknown> | null;
    constructor(s: number, c: string, p: Record<string, unknown> | null = null) {
      super(c);
      this.status = s;
      this.code = c;
      this.payload = p;
    }
  }
  return {
    callFunction: (...args: [string, Record<string, unknown>]) => mockCall(...args),
    FunctionError,
  };
});
jest.mock('@/features/auth/api', () => ({ fetchRecoveryPubkey: () => mockFetchPub() }));
jest.mock('@/services/secure-store', () => ({
  SecureKeys: { deviceId: 'f2h.device_id' },
  secureGet: jest.fn(async () => null),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));

const challengeOk = { eph_pub: toBase64(fromHex(v.ephPub)), expires_at: 'soon', attempts_left: 3 };

beforeEach(() => {
  mockCall.mockReset();
  mockFetchPub.mockClear();
  useSession.setState({ deviceId: v.deviceId, selfApproving: false });
});

describe('checkRecoveryWords (AC-3)', () => {
  it('accepts the kit words whose key matches the published one', () => {
    expect(checkRecoveryWords(WORDS, RECOVERY_PUB_B64)).toEqual({ ok: true });
    expect(
      checkRecoveryWords(
        WORDS.map((w) => ` ${w.toUpperCase()} `),
        RECOVERY_PUB_B64,
      ),
    ).toEqual({
      ok: true,
    });
  });

  it('reports a missing box, a bad checksum and a foreign kit without any network call', () => {
    const missing = WORDS.slice();
    missing[7] = '';
    expect(checkRecoveryWords(missing, RECOVERY_PUB_B64)).toEqual({ ok: false, reason: 'count' });
    const typo = WORDS.slice();
    typo[0] = typo[0] === 'abandon' ? 'ability' : 'abandon';
    expect(checkRecoveryWords(typo, RECOVERY_PUB_B64)).toEqual({ ok: false, reason: 'checksum' });
    const otherKey = toBase64(fromHex(v.ephPub));
    expect(checkRecoveryWords(WORDS, otherKey)).toEqual({ ok: false, reason: 'mismatch' });
    expect(mockCall).not.toHaveBeenCalled();
    expect(mockFetchPub).not.toHaveBeenCalled();
  });
});

describe('selfApprove (AC-2, AC-5)', () => {
  it('runs challenge then answer and sends exactly the vector tag for this device', async () => {
    mockCall
      .mockResolvedValueOnce(challengeOk)
      .mockResolvedValueOnce({ status: 'approved', attempts_left: 3 });
    await expect(selfApprove(WORDS, true)).resolves.toEqual({ kind: 'approved' });
    expect(mockCall.mock.calls.map(([name, body]) => [name, body.step])).toEqual([
      ['self-approve-device', 'challenge'],
      ['self-approve-device', 'answer'],
    ]);
    const answer = mockCall.mock.calls[1]?.[1];
    expect(answer).toEqual({
      step: 'answer',
      tag: toBase64(fromHex(v.tag)),
      revoke_others: true,
    });
  });

  it('re-issues once on an expired challenge without counting a miss', async () => {
    mockCall
      .mockResolvedValueOnce(challengeOk)
      .mockRejectedValueOnce(new FunctionError(409, 'challenge_expired', { attempts_left: 3 }))
      .mockResolvedValueOnce(challengeOk)
      .mockResolvedValueOnce({ status: 'approved', attempts_left: 3 });
    await expect(selfApprove(WORDS, false)).resolves.toEqual({ kind: 'approved' });
    expect(mockCall).toHaveBeenCalledTimes(4);
  });

  it('retries one wrong tag with a fresh challenge, then reports the tries left', async () => {
    mockCall
      .mockResolvedValueOnce(challengeOk)
      .mockRejectedValueOnce(new FunctionError(409, 'wrong_tag', { attempts_left: 2 }))
      .mockResolvedValueOnce(challengeOk)
      .mockRejectedValueOnce(new FunctionError(409, 'wrong_tag', { attempts_left: 1 }));
    await expect(selfApprove(WORDS, false)).resolves.toEqual({ kind: 'wrong', attemptsLeft: 1 });
    expect(mockCall).toHaveBeenCalledTimes(4);
  });

  it('maps rejected, not pending, too many challenges and network outcomes', async () => {
    mockCall
      .mockResolvedValueOnce(challengeOk)
      .mockResolvedValueOnce({ status: 'rejected', attempts_left: 0 });
    await expect(selfApprove(WORDS, false)).resolves.toEqual({ kind: 'rejected' });

    mockCall.mockRejectedValueOnce(new FunctionError(403, 'device_not_pending'));
    await expect(selfApprove(WORDS, false)).resolves.toEqual({ kind: 'not_pending' });

    mockCall.mockRejectedValueOnce(new FunctionError(409, 'too_many_challenges'));
    await expect(selfApprove(WORDS, false)).resolves.toEqual({ kind: 'too_many_challenges' });

    mockCall.mockRejectedValueOnce(new FunctionError(0, 'network'));
    await expect(selfApprove(WORDS, false)).resolves.toEqual({
      kind: 'network',
      message: 'network',
    });
  });

  it('never answers without a device id', async () => {
    useSession.setState({ deviceId: null });
    await expect(selfApprove(WORDS, false)).resolves.toEqual({ kind: 'not_pending' });
    expect(mockCall).not.toHaveBeenCalled();
  });
});
