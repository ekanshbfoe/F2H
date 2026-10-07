/**
 * Database types for the public schema. Written by hand from the migrations in
 * `supabase/migrations/` in the shape `supabase gen types` emits; regenerate with
 * `npm run db:types` once the CLI is linked and keep the generated output.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamp = string;

export type Database = {
  public: {
    Tables: {
      allowed_members: {
        Row: {
          email: string;
          label: Database['public']['Enums']['member_label'];
          invite_code_hash: string | null;
          invite_expires_at: Timestamp | null;
          consumed_at: Timestamp | null;
          added_by: string | null;
          created_at: Timestamp;
        };
        Insert: {
          email: string;
          label: Database['public']['Enums']['member_label'];
          invite_code_hash?: string | null;
          invite_expires_at?: Timestamp | null;
          consumed_at?: Timestamp | null;
          added_by?: string | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database['public']['Tables']['allowed_members']['Insert']>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          actor_id: string | null;
          actor_device_id: string | null;
          action: string;
          target_user_id: string | null;
          target_item_id: string | null;
          meta: Json;
          created_at: Timestamp;
        };
        Insert: {
          id?: number;
          actor_id?: string | null;
          actor_device_id?: string | null;
          action: string;
          target_user_id?: string | null;
          target_item_id?: string | null;
          meta?: Json;
          created_at?: Timestamp;
        };
        Update: Partial<Database['public']['Tables']['audit_log']['Insert']>;
        Relationships: [];
      };
      backups: {
        Row: {
          id: string;
          taken_at: Timestamp;
          drive_a_file_id: string | null;
          drive_b_file_id: string | null;
          size: number;
          sha256: string | null;
          state: string;
          created_at: Timestamp;
        };
        Insert: {
          id: string;
          taken_at?: Timestamp;
          drive_a_file_id?: string | null;
          drive_b_file_id?: string | null;
          size?: number;
          sha256?: string | null;
          state?: string;
          created_at?: Timestamp;
        };
        Update: Partial<Database['public']['Tables']['backups']['Insert']>;
        Relationships: [];
      };
      devices: {
        Row: {
          id: string;
          user_id: string;
          token_hash: string;
          registration_nonce: string;
          name: string;
          model: string;
          os: string;
          app_version: string;
          pubkey: string | null;
          push_token: string | null;
          status: Database['public']['Enums']['device_status'];
          requested_at: Timestamp;
          decided_at: Timestamp | null;
          decided_by: string | null;
          last_ip: string | null;
          last_geo: Json | null;
          last_seen_at: Timestamp;
          created_at: Timestamp;
        };
        Insert: {
          id: string;
          user_id: string;
          token_hash: string;
          registration_nonce: string;
          name?: string;
          model?: string;
          os?: string;
          app_version?: string;
          pubkey?: string | null;
          push_token?: string | null;
          status?: Database['public']['Enums']['device_status'];
          requested_at?: Timestamp;
          decided_at?: Timestamp | null;
          decided_by?: string | null;
          last_ip?: string | null;
          last_geo?: Json | null;
          last_seen_at?: Timestamp;
          created_at?: Timestamp;
        };
        Update: Partial<Database['public']['Tables']['devices']['Insert']>;
        Relationships: [];
      };
      drive_accounts: {
        Row: {
          slot: string;
          google_email: string;
          vault_secret_id: string;
          root_folder_id: string;
          linked_by: string | null;
          linked_at: Timestamp;
          status: Database['public']['Enums']['drive_status'];
          bytes_used: number;
          created_at: Timestamp;
        };
        Insert: {
          slot: string;
          google_email: string;
          vault_secret_id: string;
          root_folder_id: string;
          linked_by?: string | null;
          linked_at?: Timestamp;
          status?: Database['public']['Enums']['drive_status'];
          bytes_used?: number;
          created_at?: Timestamp;
        };
        Update: Partial<Database['public']['Tables']['drive_accounts']['Insert']>;
        Relationships: [];
      };
      family_config: {
        Row: {
          id: number;
          admin_user_id: string | null;
          admin_recovery_pubkey: string | null;
          recovery_fingerprint: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: number;
          admin_user_id?: string | null;
          admin_recovery_pubkey?: string | null;
          recovery_fingerprint?: string | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database['public']['Tables']['family_config']['Insert']>;
        Relationships: [];
      };
      file_blobs: {
        Row: {
          id: string;
          item_id: string | null;
          owner_id: string;
          size_ct: number;
          sha256: string;
          chunk_size: number;
          total_chunks: number;
          drive_a_file_id: string | null;
          drive_b_file_id: string | null;
          state: Database['public']['Enums']['blob_state'];
          last_verified_at: Timestamp | null;
          created_at: Timestamp;
        };
        Insert: {
          id: string;
          item_id?: string | null;
          owner_id: string;
          size_ct: number;
          sha256: string;
          chunk_size: number;
          total_chunks: number;
          drive_a_file_id?: string | null;
          drive_b_file_id?: string | null;
          state?: Database['public']['Enums']['blob_state'];
          last_verified_at?: Timestamp | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database['public']['Tables']['file_blobs']['Insert']>;
        Relationships: [];
      };
      key_material: {
        Row: {
          user_id: string;
          mk_wrapped_pw: string;
          mk_wrapped_admin: string;
          mk_verifier: string;
          updated_by_device: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          user_id: string;
          mk_wrapped_pw: string;
          mk_wrapped_admin: string;
          mk_verifier: string;
          updated_by_device?: string | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: Partial<Database['public']['Tables']['key_material']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          role: Database['public']['Enums']['member_role'];
          status: Database['public']['Enums']['profile_status'];
          kdf_params: Json;
          member_pubkey: string | null;
          activated_at: Timestamp | null;
          created_at: Timestamp;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string;
          role?: Database['public']['Enums']['member_role'];
          status?: Database['public']['Enums']['profile_status'];
          kdf_params: Json;
          member_pubkey?: string | null;
          activated_at?: Timestamp | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      recovery_grants: {
        Row: {
          id: string;
          member_id: string;
          device_id: string;
          mk_sealed_for_device: string;
          created_by: string;
          expires_at: Timestamp;
          consumed_at: Timestamp | null;
          created_at: Timestamp;
        };
        Insert: {
          id: string;
          member_id: string;
          device_id: string;
          mk_sealed_for_device: string;
          created_by: string;
          expires_at: Timestamp;
          consumed_at?: Timestamp | null;
          created_at?: Timestamp;
        };
        Update: Partial<Database['public']['Tables']['recovery_grants']['Insert']>;
        Relationships: [];
      };
      vault_items: {
        Row: {
          id: string;
          owner_id: string;
          kind: Database['public']['Enums']['item_kind'];
          dek_wrapped: string;
          ciphertext: string;
          version: number;
          created_at: Timestamp;
          updated_at: Timestamp;
          deleted_at: Timestamp | null;
        };
        Insert: {
          id: string;
          owner_id: string;
          kind: Database['public']['Enums']['item_kind'];
          dek_wrapped: string;
          ciphertext: string;
          version?: number;
          created_at?: Timestamp;
          updated_at?: Timestamp;
          deleted_at?: Timestamp | null;
        };
        Update: Partial<Database['public']['Tables']['vault_items']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      drive_status_view: {
        Row: {
          slot: string | null;
          google_email: string | null;
          status: Database['public']['Enums']['drive_status'] | null;
          bytes_used: number | null;
          linked_at: Timestamp | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      health: { Args: Record<PropertyKey, never>; Returns: string };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_active_member: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_approved_device: { Args: Record<PropertyKey, never>; Returns: boolean };
      create_invite: {
        Args: { p_email: string; p_label: Database['public']['Enums']['member_label'] };
        Returns: string;
      };
      admin_key_material_for_approval: {
        Args: { p_user_id: string };
        Returns: { user_id: string; mk_wrapped_admin: string; mk_verifier: string }[];
      };
      create_recovery_grant: {
        Args: {
          p_member_id: string;
          p_device_id: string;
          p_mk_sealed_for_device: string;
          p_ttl?: string;
        };
        Returns: string;
      };
    };
    Enums: {
      blob_state: 'uploading' | 'ok' | 'degraded' | 'missing';
      device_status: 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired';
      drive_status: 'active' | 'needs_relink';
      item_kind: 'contact' | 'credential' | 'file' | 'note';
      member_label: 'admin' | 'father' | 'mother' | 'brother';
      member_role: 'admin' | 'member';
      profile_status: 'pending' | 'active' | 'suspended';
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
