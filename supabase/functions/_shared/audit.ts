import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface AuditRow {
  actor_id?: string | null;
  actor_device_id?: string | null;
  action: string;
  target_user_id?: string | null;
  target_item_id?: string | null;
  meta?: Record<string, unknown>;
}

/** Appends one audit row with the service role. Never includes secrets in `meta`. */
export async function writeAudit(db: SupabaseClient, row: AuditRow): Promise<void> {
  const { error } = await db.from('audit_log').insert({
    actor_id: row.actor_id ?? null,
    actor_device_id: row.actor_device_id ?? null,
    action: row.action,
    target_user_id: row.target_user_id ?? null,
    target_item_id: row.target_item_id ?? null,
    meta: row.meta ?? {},
  });
  if (error) console.error('audit insert failed', row.action, error.message);
}

export function randomToken(bytes = 32): Uint8Array {
  const out = new Uint8Array(bytes);
  crypto.getRandomValues(out);
  return out;
}
