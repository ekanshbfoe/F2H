import { parsePayload as parseContact, type ContactPayload } from '@/features/contacts/model';
import {
  parsePayload as parseCredential,
  type CredentialPayload,
} from '@/features/credentials/model';
import { parsePayload as parseFile, type FilePayload } from '@/features/files/model';
import { loadRecoverySecretKey } from '@/features/keyring/admin-recovery';
import { withKey } from '@/features/lock/api';
import { openItem, type ItemRow, type StoredItem } from '@/features/vault/items';
import { callFunction } from '@/services/functions';

import { verifyMemberWrap } from './api';

/**
 * Admin oversight (spec 0005, AC-2, AC-3). The function writes the audit row and pushes the
 * member before it returns anything; this phone unseals the member key with the recovery secret,
 * proves it with the verifier, decrypts read only, and zeroes both keys before returning.
 */

export class OversightError extends Error {
  constructor(
    readonly code: 'no_recovery_key' | 'tampered' | 'not_found' | 'denied' | 'failed',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'OversightError';
  }
}

export interface MemberVault {
  contacts: StoredItem<ContactPayload>[];
  credentials: StoredItem<CredentialPayload>[];
  files: StoredItem<FilePayload>[];
  /** rows that did not open (another kind, or damaged) */
  skipped: number;
}

interface OpenResponse {
  mk_wrapped_admin: string;
  mk_verifier: string;
  items: (ItemRow & { kind: string })[];
}

/** Pure part, tested on its own: unseal, verify, decrypt, zero. */
export function decryptMemberVault(
  recoverySecret: Uint8Array,
  memberId: string,
  res: OpenResponse,
): MemberVault {
  const mk = verifyMemberWrap(recoverySecret, {
    user_id: memberId,
    mk_wrapped_admin: res.mk_wrapped_admin,
    mk_verifier: res.mk_verifier,
  });
  if (!mk) throw new OversightError('tampered');
  try {
    const out: MemberVault = { contacts: [], credentials: [], files: [], skipped: 0 };
    for (const row of res.items) {
      if (row.kind === 'contact') {
        const c = openItem(mk, row, parseContact);
        if (c) out.contacts.push(c);
        else out.skipped += 1;
      } else if (row.kind === 'credential') {
        const c = openItem(mk, row, parseCredential);
        if (c) out.credentials.push(c);
        else out.skipped += 1;
      } else if (row.kind === 'file') {
        const f = openItem(mk, row, parseFile);
        if (f) out.files.push(f);
        else out.skipped += 1;
      }
      // notes (the Admin's own recovery note lives only in the Admin's vault) are not shown
    }
    return out;
  } finally {
    mk.fill(0);
  }
}

export async function openMemberVault(memberId: string): Promise<MemberVault> {
  return withKey(async (adminMk) => {
    const secret = await loadRecoverySecretKey(adminMk);
    if (!secret) throw new OversightError('no_recovery_key');
    try {
      let res: OpenResponse;
      try {
        res = await callFunction<OpenResponse>('oversight-open', { member_id: memberId });
      } catch (e) {
        const code = (e as { code?: string; status?: number }).code;
        if (code === 'member_not_found') throw new OversightError('not_found');
        if (code === 'admin_required' || code === 'device_not_approved')
          throw new OversightError('denied');
        throw new OversightError('failed', code);
      }
      return decryptMemberVault(secret, memberId, res);
    } finally {
      secret.fill(0);
    }
  });
}
