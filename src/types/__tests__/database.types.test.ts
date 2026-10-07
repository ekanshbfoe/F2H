// covers: AC-2 at the type level (the generated types carry every table and enum the spec lists),
// so a regeneration that drops a surface fails here before it breaks a feature.
import { Constants, type Database } from '../database.types';

type TableName = keyof Database['public']['Tables'];
const SPEC_TABLES: TableName[] = [
  'family_config',
  'allowed_members',
  'profiles',
  'key_material',
  'devices',
  'vault_items',
  'file_blobs',
  'drive_accounts',
  'recovery_grants',
  'audit_log',
  'backups',
];

describe('generated database types', () => {
  it('lists every enum value from the spec', () => {
    expect(Constants.public.Enums).toEqual({
      blob_state: ['uploading', 'ok', 'degraded', 'missing'],
      device_status: ['pending', 'approved', 'rejected', 'revoked', 'expired'],
      drive_status: ['active', 'needs_relink'],
      item_kind: ['contact', 'credential', 'file', 'note'],
      member_label: ['admin', 'father', 'mother', 'brother'],
      member_role: ['admin', 'member'],
      profile_status: ['pending', 'active', 'suspended'],
    });
  });

  it('types every spec table and the drive status view (compile time check)', () => {
    // A missing table or view would fail the typecheck of these assignments.
    const rows: { [K in TableName]: Database['public']['Tables'][K]['Row'] | null } = {
      family_config: null,
      allowed_members: null,
      profiles: null,
      key_material: null,
      devices: null,
      vault_items: null,
      file_blobs: null,
      drive_accounts: null,
      recovery_grants: null,
      audit_log: null,
      backups: null,
    };
    const view: Database['public']['Views']['drive_status_view']['Row'] | null = null;
    const health: Database['public']['Functions']['health']['Returns'] = 'ok';
    expect(Object.keys(rows).sort()).toEqual([...SPEC_TABLES].sort());
    expect(view).toBeNull();
    expect(health).toBe('ok');
  });
});
