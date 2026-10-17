import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Avatar, Badge, Button, Callout, Sheet, Text, confirm } from '@/components/ui';
import { listMembers, type MemberRow } from '@/features/admin/api';
import { useSteadyRouter } from '@/hooks/useSteadyRouter';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

export interface AccountSheetProps {
  open: boolean;
  onClose: () => void;
  onSettings: () => void;
}

type Member = MemberRow & { relation: string | null };

/**
 * The avatar's sheet, like an account switcher: your own card on top with Account settings, and
 * for the Admin every family member below. Opening a member's vault asks first, says the member
 * is told, then shows it read only (spec 0005).
 */
export function AccountSheet({ open, onClose, onSettings }: AccountSheetProps) {
  const t = useTheme();
  const router = useSteadyRouter();
  const profile = useSession((s) => s.profile);
  const isAdmin = profile?.role === 'admin';
  const [members, setMembers] = useState<Member[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    if (!open || !isAdmin) return undefined;
    let live = true;
    listMembers()
      .then(({ profiles, allowed }) => {
        if (!live) return;
        const relation = new Map(allowed.map((a) => [a.email.toLowerCase(), a.label]));
        setMembers(
          profiles
            .filter((p) => p.role !== 'admin')
            .map((p) => ({ ...p, relation: relation.get(p.email.toLowerCase()) ?? null })),
        );
      })
      .catch(() => {
        if (live) setMembers('error');
      });
    return () => {
      live = false;
    };
  }, [open, isAdmin]);

  const openVault = async (m: Member) => {
    const ok = await confirm({
      title: `Open ${m.display_name}'s vault?`,
      message: `${m.display_name} gets a notification and an Activity entry saying you opened it. You see it read only.`,
      confirmLabel: 'Open, logged',
      cancelLabel: 'Cancel',
      tone: 'primary',
      icon: 'eye-outline',
    });
    if (!ok) return;
    onClose();
    router.push({
      pathname: '/(admin)/oversight/[userId]',
      params: { userId: m.id, name: m.display_name },
    });
  };

  const name = profile?.display_name ?? 'You';

  return (
    <Sheet open={open} onClose={onClose} title="Account" testID="account-sheet">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        <Avatar name={name} size="lg" />
        <View style={{ flex: 1, gap: t.spacing.xxs }}>
          <Text variant="heading" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" color="muted" numberOfLines={1}>
            {profile?.email ?? ''}
          </Text>
        </View>
        {isAdmin ? <Badge tone="primary">Admin</Badge> : null}
      </View>
      <Button
        variant="secondary"
        size="sm"
        onPress={() => {
          onClose();
          onSettings();
        }}
        testID="account-settings"
        leading={<Ionicons name="settings-outline" size={t.sizes.icon} color={t.colors.primary} />}
      >
        Account settings
      </Button>

      {isAdmin ? (
        <View style={{ gap: t.spacing.sm, marginTop: t.spacing.sm }}>
          <Text variant="caption" color="muted" accessibilityRole="header">
            Family vaults
          </Text>
          {members === 'loading' ? (
            <ActivityIndicator color={t.colors.primary} accessibilityLabel="Loading the family" />
          ) : null}
          {members === 'error' ? (
            <Callout tone="danger">Could not load the family. Check your connection.</Callout>
          ) : null}
          {Array.isArray(members) && members.length === 0 ? (
            <Text variant="body" color="muted">
              Nobody else yet. Invite someone from Family → Members.
            </Text>
          ) : null}
          {Array.isArray(members)
            ? members.map((m) => {
                const active = m.status === 'active';
                return (
                  <Pressable
                    key={m.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${m.display_name}'s vault`}
                    accessibilityState={{ disabled: !active }}
                    disabled={!active}
                    onPress={() => void openVault(m)}
                    testID={`account-member-${m.id}`}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.spacing.md,
                      minHeight: t.sizes.touch,
                      padding: t.spacing.sm,
                      borderRadius: t.radii.lg,
                      backgroundColor: pressed ? t.colors.primaryTint : 'transparent',
                      opacity: active ? 1 : t.opacity.disabled,
                    })}
                  >
                    <Avatar name={m.display_name} />
                    <View style={{ flex: 1, gap: t.spacing.xxs }}>
                      <Text variant="label" color="ink" numberOfLines={1}>
                        {m.display_name}
                      </Text>
                      <Text variant="caption" color="muted" numberOfLines={1}>
                        {active ? (m.relation ?? m.email) : `Waiting for approval · ${m.email}`}
                      </Text>
                    </View>
                    {active ? (
                      <Ionicons
                        name="chevron-forward"
                        size={t.sizes.icon}
                        color={t.colors.lineStrong}
                      />
                    ) : null}
                  </Pressable>
                );
              })
            : null}
        </View>
      ) : null}
    </Sheet>
  );
}
