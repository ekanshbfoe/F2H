import { callFunction } from '@/services/functions';
import { supabase } from '@/services/supabase';

/** Encrypted snapshots on both Drives (spec 0006, AC-3, AC-5). The Admin reads; the function writes. */

export interface BackupRow {
  id: string;
  taken_at: string;
  size: number;
  state: string;
  drive_a_file_id: string | null;
  drive_b_file_id: string | null;
}

export async function listBackups(): Promise<BackupRow[]> {
  const { data, error } = await supabase
    .from('backups')
    .select('id, taken_at, size, state, drive_a_file_id, drive_b_file_id')
    .order('taken_at', { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return (data ?? []) as BackupRow[];
}

export interface BackupResult {
  backup_id: string;
  state: 'ok' | 'degraded' | 'failed';
  size: number;
}

export async function backUpNow(): Promise<BackupResult> {
  return callFunction<BackupResult>('backup-metadata', {});
}
