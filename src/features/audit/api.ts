import { supabase } from '@/services/supabase';

import type { AuditRow } from './model';

export const ACTIVITY_LIMIT = 100;

/**
 * The newest rows the caller may see (spec 0005, AC-5). Row level security decides: a member
 * gets rows where they are the actor or the target, the Admin gets everything.
 */
export async function listActivity(): Promise<{ rows: AuditRow[]; names: Record<string, string> }> {
  const [rows, profiles] = await Promise.all([
    supabase
      .from('audit_log')
      .select('id, actor_id, target_user_id, action, meta, created_at')
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_LIMIT),
    // the Admin reads every profile; a member reads their own, which is enough for "You"
    supabase.from('profiles').select('id, display_name'),
  ]);
  if (rows.error) throw new Error(rows.error.message);
  const names: Record<string, string> = {};
  for (const p of profiles.data ?? []) names[p.id] = p.display_name;
  return { rows: (rows.data ?? []) as AuditRow[], names };
}
