import { box, envelope, fromBase64, mnemonic, recovery, toBase64, verifier, zero } from '@/crypto';
import { createNoteItem, deleteItem, findNoteByTag } from '@/features/vault/api';
import { SecureKeys, secureGet, secureSet } from '@/services/secure-store';
import { supabase } from '@/services/supabase';

export const RECOVERY_TAG = 'recovery-key';

export interface RecoveryKitDraft {
  seed: Uint8Array;
  words: string[];
  fingerprint: string;
}

/** Step 1 of the Admin first run: a fresh seed and its 24 words (AC-4). */
export function startRecoveryKit(): RecoveryKitDraft {
  const seed = recovery.generateSeed();
  const pair = recovery.deriveRecoveryKeypair(seed);
  zero(pair.secretKey);
  return {
    seed,
    words: mnemonic.fromSeed(seed),
    fingerprint: recovery.fingerprint(pair.publicKey),
  };
}

/** Three random word positions (1 based) to confirm, sorted. */
export function pickConfirmPositions(count = 24, picks = 3): number[] {
  const positions = new Set<number>();
  while (positions.size < picks) {
    const n = new Uint32Array(1);
    globalThis.crypto.getRandomValues(n);
    positions.add(((n[0] ?? 0) % count) + 1);
  }
  return [...positions].sort((a, b) => a - b);
}

/**
 * Step 2: keep the seed as a vault note first (so a failed publish can be retried from scratch),
 * then publish the public key and fingerprint and create the Admin's own key material in one RPC.
 * The Admin MK is sealed to the same key, so the mnemonic recovers the Admin too. On a failed RPC
 * the note is removed again and every secret is zeroed.
 */
export async function finishRecoveryKit(
  draft: RecoveryKitDraft,
  kek: Uint8Array,
  userId: string,
): Promise<Uint8Array> {
  const pair = recovery.deriveRecoveryKeypair(draft.seed);
  const mk = envelope.generateMasterKey();
  let itemId: string | null = null;
  try {
    itemId = await createNoteItem(mk, userId, {
      v: 1,
      type: 'note',
      tag: RECOVERY_TAG,
      title: 'Recovery key',
      body: toBase64(draft.seed),
    });
    const { error } = await supabase.rpc('admin_first_run', {
      p_recovery_pub: toBase64(pair.publicKey),
      p_fingerprint: draft.fingerprint,
      p_mk_wrapped_pw: toBase64(envelope.wrapMk(kek, mk, userId)),
      p_mk_wrapped_admin: toBase64(box.seal(pair.publicKey, mk)),
      p_mk_verifier: toBase64(verifier.make(mk, userId)),
    });
    if (error) throw new Error(`admin_first_run failed: ${error.message}`);
    await secureSet(SecureKeys.recoveryItemId, itemId);
    return mk;
  } catch (error) {
    if (itemId) await deleteItem(itemId).catch(() => undefined);
    zero(mk);
    throw error;
  } finally {
    zero(pair.secretKey);
  }
}

/** The Admin recovery secret key, read from the vault note after unlock. Zero it after use. */
export async function loadRecoverySecretKey(mk: Uint8Array): Promise<Uint8Array | null> {
  const hint = await secureGet(SecureKeys.recoveryItemId);
  const found = await findNoteByTag(mk, RECOVERY_TAG, hint);
  if (!found) return null;
  if (found.id !== hint) await secureSet(SecureKeys.recoveryItemId, found.id);
  const seed = fromBase64(found.note.body);
  const pair = recovery.deriveRecoveryKeypair(seed);
  zero(seed);
  return pair.secretKey;
}

/** Re export the kit later (Settings): the 24 words from the stored seed. */
export async function exportRecoveryWords(mk: Uint8Array): Promise<string[] | null> {
  const hint = await secureGet(SecureKeys.recoveryItemId);
  const found = await findNoteByTag(mk, RECOVERY_TAG, hint);
  if (!found) return null;
  const seed = fromBase64(found.note.body);
  const words = mnemonic.fromSeed(seed);
  zero(seed);
  return words;
}
