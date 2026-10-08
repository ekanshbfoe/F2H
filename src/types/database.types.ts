export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      allowed_members: {
        Row: {
          added_by: string | null;
          consumed_at: string | null;
          created_at: string;
          email: string;
          invite_code_hash: string | null;
          invite_expires_at: string | null;
          label: Database['public']['Enums']['member_label'];
        };
        Insert: {
          added_by?: string | null;
          consumed_at?: string | null;
          created_at?: string;
          email: string;
          invite_code_hash?: string | null;
          invite_expires_at?: string | null;
          label: Database['public']['Enums']['member_label'];
        };
        Update: {
          added_by?: string | null;
          consumed_at?: string | null;
          created_at?: string;
          email?: string;
          invite_code_hash?: string | null;
          invite_expires_at?: string | null;
          label?: Database['public']['Enums']['member_label'];
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          actor_device_id: string | null;
          actor_id: string | null;
          created_at: string;
          id: number;
          meta: Json;
          target_item_id: string | null;
          target_user_id: string | null;
        };
        Insert: {
          action: string;
          actor_device_id?: string | null;
          actor_id?: string | null;
          created_at?: string;
          id?: number;
          meta?: Json;
          target_item_id?: string | null;
          target_user_id?: string | null;
        };
        Update: {
          action?: string;
          actor_device_id?: string | null;
          actor_id?: string | null;
          created_at?: string;
          id?: number;
          meta?: Json;
          target_item_id?: string | null;
          target_user_id?: string | null;
        };
        Relationships: [];
      };
      backups: {
        Row: {
          created_at: string;
          drive_a_file_id: string | null;
          drive_b_file_id: string | null;
          id: string;
          sha256: string | null;
          size: number;
          state: string;
          taken_at: string;
        };
        Insert: {
          created_at?: string;
          drive_a_file_id?: string | null;
          drive_b_file_id?: string | null;
          id: string;
          sha256?: string | null;
          size?: number;
          state?: string;
          taken_at?: string;
        };
        Update: {
          created_at?: string;
          drive_a_file_id?: string | null;
          drive_b_file_id?: string | null;
          id?: string;
          sha256?: string | null;
          size?: number;
          state?: string;
          taken_at?: string;
        };
        Relationships: [];
      };
      devices: {
        Row: {
          app_version: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          last_geo: Json | null;
          last_ip: unknown;
          last_seen_at: string;
          model: string;
          name: string;
          os: string;
          pubkey: string | null;
          push_token: string | null;
          registration_nonce: string;
          requested_at: string;
          status: Database['public']['Enums']['device_status'];
          token_hash: string;
          user_id: string;
        };
        Insert: {
          app_version?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id: string;
          last_geo?: Json | null;
          last_ip?: unknown;
          last_seen_at?: string;
          model?: string;
          name?: string;
          os?: string;
          pubkey?: string | null;
          push_token?: string | null;
          registration_nonce: string;
          requested_at?: string;
          status?: Database['public']['Enums']['device_status'];
          token_hash: string;
          user_id: string;
        };
        Update: {
          app_version?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          last_geo?: Json | null;
          last_ip?: unknown;
          last_seen_at?: string;
          model?: string;
          name?: string;
          os?: string;
          pubkey?: string | null;
          push_token?: string | null;
          registration_nonce?: string;
          requested_at?: string;
          status?: Database['public']['Enums']['device_status'];
          token_hash?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'devices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      drive_accounts: {
        Row: {
          bytes_used: number;
          created_at: string;
          google_email: string;
          linked_at: string;
          linked_by: string | null;
          root_folder_id: string;
          slot: string;
          status: Database['public']['Enums']['drive_status'];
          vault_secret_id: string;
        };
        Insert: {
          bytes_used?: number;
          created_at?: string;
          google_email: string;
          linked_at?: string;
          linked_by?: string | null;
          root_folder_id: string;
          slot: string;
          status?: Database['public']['Enums']['drive_status'];
          vault_secret_id: string;
        };
        Update: {
          bytes_used?: number;
          created_at?: string;
          google_email?: string;
          linked_at?: string;
          linked_by?: string | null;
          root_folder_id?: string;
          slot?: string;
          status?: Database['public']['Enums']['drive_status'];
          vault_secret_id?: string;
        };
        Relationships: [];
      };
      family_config: {
        Row: {
          admin_recovery_pubkey: string | null;
          admin_user_id: string | null;
          created_at: string;
          id: number;
          recovery_fingerprint: string | null;
          updated_at: string;
        };
        Insert: {
          admin_recovery_pubkey?: string | null;
          admin_user_id?: string | null;
          created_at?: string;
          id?: number;
          recovery_fingerprint?: string | null;
          updated_at?: string;
        };
        Update: {
          admin_recovery_pubkey?: string | null;
          admin_user_id?: string | null;
          created_at?: string;
          id?: number;
          recovery_fingerprint?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      file_blobs: {
        Row: {
          chunk_size: number;
          created_at: string;
          drive_a_file_id: string | null;
          drive_b_file_id: string | null;
          id: string;
          item_id: string | null;
          last_verified_at: string | null;
          owner_id: string;
          sha256: string;
          size_ct: number;
          state: Database['public']['Enums']['blob_state'];
          total_chunks: number;
        };
        Insert: {
          chunk_size: number;
          created_at?: string;
          drive_a_file_id?: string | null;
          drive_b_file_id?: string | null;
          id: string;
          item_id?: string | null;
          last_verified_at?: string | null;
          owner_id: string;
          sha256: string;
          size_ct: number;
          state?: Database['public']['Enums']['blob_state'];
          total_chunks: number;
        };
        Update: {
          chunk_size?: number;
          created_at?: string;
          drive_a_file_id?: string | null;
          drive_b_file_id?: string | null;
          id?: string;
          item_id?: string | null;
          last_verified_at?: string | null;
          owner_id?: string;
          sha256?: string;
          size_ct?: number;
          state?: Database['public']['Enums']['blob_state'];
          total_chunks?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'file_blobs_item_id_fkey';
            columns: ['item_id'];
            isOneToOne: false;
            referencedRelation: 'vault_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'file_blobs_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      key_material: {
        Row: {
          created_at: string;
          mk_verifier: string;
          mk_wrapped_admin: string;
          mk_wrapped_pw: string;
          updated_at: string;
          updated_by_device: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          mk_verifier: string;
          mk_wrapped_admin: string;
          mk_wrapped_pw: string;
          updated_at?: string;
          updated_by_device?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          mk_verifier?: string;
          mk_wrapped_admin?: string;
          mk_wrapped_pw?: string;
          updated_at?: string;
          updated_by_device?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'key_material_updated_by_device_fkey';
            columns: ['updated_by_device'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'key_material_updated_by_device_fkey';
            columns: ['updated_by_device'];
            isOneToOne: false;
            referencedRelation: 'member_devices_view';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'key_material_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          activated_at: string | null;
          created_at: string;
          display_name: string;
          email: string;
          id: string;
          kdf_params: Json;
          member_pubkey: string | null;
          role: Database['public']['Enums']['member_role'];
          status: Database['public']['Enums']['profile_status'];
        };
        Insert: {
          activated_at?: string | null;
          created_at?: string;
          display_name?: string;
          email: string;
          id: string;
          kdf_params: Json;
          member_pubkey?: string | null;
          role?: Database['public']['Enums']['member_role'];
          status?: Database['public']['Enums']['profile_status'];
        };
        Update: {
          activated_at?: string | null;
          created_at?: string;
          display_name?: string;
          email?: string;
          id?: string;
          kdf_params?: Json;
          member_pubkey?: string | null;
          role?: Database['public']['Enums']['member_role'];
          status?: Database['public']['Enums']['profile_status'];
        };
        Relationships: [];
      };
      recovery_grants: {
        Row: {
          consumed_at: string | null;
          created_at: string;
          created_by: string;
          device_id: string;
          expires_at: string;
          id: string;
          member_id: string;
          mk_sealed_for_device: string;
        };
        Insert: {
          consumed_at?: string | null;
          created_at?: string;
          created_by: string;
          device_id: string;
          expires_at: string;
          id: string;
          member_id: string;
          mk_sealed_for_device: string;
        };
        Update: {
          consumed_at?: string | null;
          created_at?: string;
          created_by?: string;
          device_id?: string;
          expires_at?: string;
          id?: string;
          member_id?: string;
          mk_sealed_for_device?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recovery_grants_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recovery_grants_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'member_devices_view';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recovery_grants_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      vault_items: {
        Row: {
          ciphertext: string;
          created_at: string;
          dek_wrapped: string;
          deleted_at: string | null;
          id: string;
          kind: Database['public']['Enums']['item_kind'];
          owner_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          ciphertext: string;
          created_at?: string;
          dek_wrapped: string;
          deleted_at?: string | null;
          id: string;
          kind: Database['public']['Enums']['item_kind'];
          owner_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          ciphertext?: string;
          created_at?: string;
          dek_wrapped?: string;
          deleted_at?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['item_kind'];
          owner_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'vault_items_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      drive_status_view: {
        Row: {
          bytes_used: number | null;
          google_email: string | null;
          linked_at: string | null;
          slot: string | null;
          status: Database['public']['Enums']['drive_status'] | null;
        };
        Insert: {
          bytes_used?: number | null;
          google_email?: string | null;
          linked_at?: string | null;
          slot?: string | null;
          status?: Database['public']['Enums']['drive_status'] | null;
        };
        Update: {
          bytes_used?: number | null;
          google_email?: string | null;
          linked_at?: string | null;
          slot?: string | null;
          status?: Database['public']['Enums']['drive_status'] | null;
        };
        Relationships: [];
      };
      member_devices_view: {
        Row: {
          app_version: string | null;
          decided_at: string | null;
          display_name: string | null;
          email: string | null;
          id: string | null;
          last_geo: Json | null;
          last_seen_at: string | null;
          model: string | null;
          name: string | null;
          os: string | null;
          profile_status: Database['public']['Enums']['profile_status'] | null;
          pubkey: string | null;
          requested_at: string | null;
          role: Database['public']['Enums']['member_role'] | null;
          status: Database['public']['Enums']['device_status'] | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'devices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      admin_first_run: {
        Args: {
          p_fingerprint: string;
          p_mk_verifier: string;
          p_mk_wrapped_admin: string;
          p_mk_wrapped_pw: string;
          p_recovery_pub: string;
        };
        Returns: undefined;
      };
      admin_key_material_for_approval: {
        Args: { p_user_id: string };
        Returns: {
          mk_verifier: string;
          mk_wrapped_admin: string;
          user_id: string;
        }[];
      };
      assert_admin_device: { Args: never; Returns: undefined };
      call_edge_function: {
        Args: { p_body?: Json; p_name: string };
        Returns: number;
      };
      cancel_my_device: {
        Args: { p_device_id: string };
        Returns: Database['public']['Enums']['device_status'];
      };
      create_invite: {
        Args: {
          p_email: string;
          p_label: Database['public']['Enums']['member_label'];
        };
        Returns: string;
      };
      create_recovery_grant: {
        Args: {
          p_device_id: string;
          p_member_id: string;
          p_mk_sealed_for_device: string;
          p_ttl?: string;
        };
        Returns: string;
      };
      current_device_id: { Args: never; Returns: string };
      decide_device: {
        Args: {
          p_admin_device_id: string;
          p_admin_id: string;
          p_decision: string;
          p_device_id: string;
        };
        Returns: {
          display_name: string;
          push_token: string;
          status: Database['public']['Enums']['device_status'];
          user_id: string;
        }[];
      };
      health: { Args: never; Returns: string };
      is_active_member: { Args: never; Returns: boolean };
      is_admin: { Args: never; Returns: boolean };
      is_approved_device: { Args: never; Returns: boolean };
      recovery_pubkey: {
        Args: never;
        Returns: {
          fingerprint: string;
          recovery_pub: string;
        }[];
      };
      request_device_token_hash: { Args: never; Returns: string };
      revoke_my_device: {
        Args: { p_device_id: string };
        Returns: Database['public']['Enums']['device_status'];
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
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      blob_state: ['uploading', 'ok', 'degraded', 'missing'],
      device_status: ['pending', 'approved', 'rejected', 'revoked', 'expired'],
      drive_status: ['active', 'needs_relink'],
      item_kind: ['contact', 'credential', 'file', 'note'],
      member_label: ['admin', 'father', 'mother', 'brother'],
      member_role: ['admin', 'member'],
      profile_status: ['pending', 'active', 'suspended'],
    },
  },
} as const;
