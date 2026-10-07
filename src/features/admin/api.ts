import { box, CryptoError, fromBase64, randomUuid, toBase64, verifier } from '@/crypto';
import { callFunction } from '@/services/functions';
import { supabase } from '@/services/supabase';
import type { Database, Tables } from '@/types/database.types';

export type MemberDevice = Database['public']['Views']['member_devices_view']['Row'];
export type MemberLabel = Database['public']['Enums']['member_label'];

/** Pending devices across the family, newest first (admin policy + approved device). */
export async function listPendingDevices(): Promise<MemberDevice[]> {
  const { data, error } = await supabase
    .from('member_devices_view')
    .select('*')
    .eq('status', 'pending')
    .order('requested_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Calls `onChange` on any devices change; the screen refetches the list (AC-9). The channel name
 * is unique per subscriber: the client hands back an existing channel for a repeated topic, and
 * adding a listener after `subscribe()` throws (Home and Approvals both watch this table).
 */
export function subscribePendingDevices(onChange: () => void): () => void {
  const channel = supabase
    .channel(`admin-pending-devices-${randomUuid()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, () => onChange())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export interface ApprovalMaterial {
  user_id: string;
  mk_wrapped_admin: string;
  mk_verifier: string;
}

/** The member's sealed wrap and verifier; the call itself is audited server side (AC-10). */
export async function fetchApprovalMaterial(userId: string): Promise<ApprovalMaterial | null> {
  const { data, error } = await supabase.rpc('admin_key_material_for_approval', {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as ApprovalMaterial | undefined;
  return row ?? null;
}

/**
 * Unseals the member MK with the recovery secret and checks the verifier. Returns the MK on
 * success (zero it after use) or null when the wrap was tampered with or sealed to another key.
 */
export function verifyMemberWrap(
  recoverySecret: Uint8Array,
  material: ApprovalMaterial,
): Uint8Array | null {
  try {
    const mk = box.open(recoverySecret, fromBase64(material.mk_wrapped_admin));
    if (!verifier.check(mk, material.user_id, fromBase64(material.mk_verifier))) {
      mk.fill(0);
      return null;
    }
    return mk;
  } catch (error) {
    if (error instanceof CryptoError) return null;
    throw error;
  }
}

export async function decideDevice(
  deviceId: string,
  decision: 'approve' | 'reject',
): Promise<'approved' | 'rejected'> {
  const res = await callFunction<{ status: 'approved' | 'rejected' }>('approve-device', {
    device_id: deviceId,
    decision,
  });
  return res.status;
}

export type MemberRow = Pick<
  Tables<'profiles'>,
  'id' | 'email' | 'display_name' | 'role' | 'status'
>;
export type AllowedRow = Pick<
  Tables<'allowed_members'>,
  'email' | 'label' | 'invite_expires_at' | 'consumed_at'
>;

export async function listMembers(): Promise<{ profiles: MemberRow[]; allowed: AllowedRow[] }> {
  const [p, a] = await Promise.all([
    supabase.from('profiles').select('id, email, display_name, role, status').order('created_at'),
    supabase
      .from('allowed_members')
      .select('email, label, invite_expires_at, consumed_at')
      .order('created_at'),
  ]);
  if (p.error) throw new Error(p.error.message);
  if (a.error) throw new Error(a.error.message);
  return { profiles: p.data ?? [], allowed: a.data ?? [] };
}

/** Issues (or reissues) the 8 character invite; the plain code is returned exactly once (AC-5). */
export async function createInvite(email: string, label: MemberLabel): Promise<string> {
  const { data, error } = await supabase.rpc('create_invite', {
    p_email: email.trim().toLowerCase(),
    p_label: label,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function listMemberDevices(userId: string): Promise<MemberDevice[]> {
  const { data, error } = await supabase
    .from('member_devices_view')
    .select('*')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Admin assisted reset (AC-15): recover the member MK, seal it to the chosen device's public key
 * and store the grant. The member device redeems it in the forgot password flow.
 */
export async function createRecoveryGrant(
  recoverySecret: Uint8Array,
  member: { user_id: string },
  device: { id: string; pubkey: string | null },
): Promise<string> {
  if (!device.pubkey) throw new Error('device has no public key');
  const material = await fetchApprovalMaterial(member.user_id);
  if (!material) throw new Error('no key material for this member');
  const mk = verifyMemberWrap(recoverySecret, material);
  if (!mk) throw new Error('tampered');
  const sealed = toBase64(box.seal(fromBase64(device.pubkey), mk));
  mk.fill(0);
  const { data, error } = await supabase.rpc('create_recovery_grant', {
    p_member_id: member.user_id,
    p_device_id: device.id,
    p_mk_sealed_for_device: sealed,
  });
  if (error) throw new Error(error.message);
  return String(data);
}
