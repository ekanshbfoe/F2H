/**
 * Activity log labels (spec 0005, AC-5). Every action the backend writes has a plain sentence;
 * an action added later without a label shows its raw name rather than disappearing.
 */

export interface AuditRow {
  id: number;
  actor_id: string | null;
  target_user_id: string | null;
  action: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export const ACTION_LABELS: Record<string, string> = {
  'admin.first_run': 'The Admin set up F2H and the recovery kit',
  signup: 'Account created with an invite code',
  'signup.bad_invite': 'Someone tried to sign up with a wrong invite code',
  'invite.create': 'An invite code was created',
  'invite.expired': 'Unused invite codes expired',
  'device.register': 'A phone asked to join',
  'device.auto_approved': 'The first Admin phone was approved',
  'device.approve': 'A phone was approved',
  'device.reject': 'A phone was rejected',
  'device.cancel': 'A phone cancelled its request',
  'device.expired': 'A phone request expired after a day',
  'device.replaced': 'A waiting Admin request was replaced by a newer one',
  'device.self_revoke': 'A phone wiped itself (PIN forgotten or too many wrong PINs)',
  'device.revoke': 'A phone was signed out by the Admin',
  'device.self_approve': 'The Admin approved a phone with the paper recovery kit',
  'device.self_approve_failed': 'A recovery kit proof failed three times; the request was refused',
  'key_material.read_for_approval': 'The Admin checked a key before approving a phone',
  'key_material.update': 'A vault key wrap changed (password change or reset)',
  'recovery_grant.create': 'The Admin issued a password recovery grant',
  'password.reset': 'A password was reset with an Admin grant',
  'oversight.open': 'The Admin opened a vault, read only',
  'file.upload': 'A file was saved to the Drives',
  'file.delete': 'A file was deleted',
  'drive.link': 'A Google Drive was linked',
  'drive.needs_relink': 'A Google Drive stopped working and needs linking again',
  'drive.reconcile': 'The nightly Drive check ran',
  'backup.snapshot': 'An encrypted backup was saved to the Drives',
};

export function labelFor(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** Who the row is about, in words, from the viewer's side. */
export function whoLine(
  row: AuditRow,
  viewer: { id: string; isAdmin: boolean },
  names: Record<string, string>,
): string {
  const name = (id: string | null) =>
    id === null
      ? null
      : id === viewer.id
        ? 'You'
        : (names[id] ?? (viewer.isAdmin ? 'A member' : 'The Admin'));
  const actor = name(row.actor_id);
  const target = name(row.target_user_id);
  if (row.action === 'oversight.open') {
    return row.target_user_id === viewer.id
      ? 'The Admin viewed your vault'
      : `Viewed ${target ?? 'a vault'}`;
  }
  if (actor && target && actor !== target) return `${actor} · about ${target}`;
  return actor ?? target ?? 'System';
}

/** "Pixel 8" from meta when the backend recorded a model. */
export function deviceLine(row: AuditRow): string | null {
  const m = row.meta?.model;
  return typeof m === 'string' && m ? m : null;
}

/** The oversight rows a member should notice first. */
export function isOversightOfViewer(row: AuditRow, viewerId: string): boolean {
  return row.action === 'oversight.open' && row.target_user_id === viewerId;
}
