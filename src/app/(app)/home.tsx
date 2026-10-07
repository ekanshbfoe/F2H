import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar, Badge, Button, Callout, Card, Row, Screen, Text } from '@/components/ui';
import { listPendingDevices, subscribePendingDevices } from '@/features/admin/api';
import { signOut } from '@/features/auth/api';
import { pathFor } from '@/features/auth/routes';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

/**
 * Home shell for this slice: greeting, Admin quick actions and account settings. The vault tabs
 * (Contacts, Credentials, Files) arrive with their features; the PIN lock with App lock.
 */
export default function HomeScreen() {
  const t = useTheme();
  const router = useRouter();
  const profile = useSession((s) => s.profile);
  const unlocked = useSession((s) => s.mk !== null);
  const [pending, setPending] = useState<number | null>(null);
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return undefined;
    const load = () =>
      listPendingDevices()
        .then((d) => setPending(d.length))
        .catch(() => setPending(null));
    load();
    return subscribePendingDevices(load);
  }, [isAdmin]);

  return (
    <Screen bare>
      <View
        style={{
          paddingTop: t.spacing.huge + t.spacing.lg,
          paddingHorizontal: t.sizes.sheetInset,
          paddingBottom: t.spacing.xxl,
          gap: t.spacing.lg,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <Avatar name={profile?.display_name ?? 'F2H'} size="lg" />
          <View style={{ flex: 1 }}>
            <Text variant="title" accessibilityRole="header">
              {`Hi ${profile?.display_name ?? 'there'}`}
            </Text>
            <Text variant="body" color="muted">
              {isAdmin ? 'Family Admin' : 'Family member'}
            </Text>
          </View>
          <Badge tone={unlocked ? 'success' : 'warning'}>{unlocked ? 'Unlocked' : 'Locked'}</Badge>
        </View>

        {isAdmin ? (
          <Card style={{ gap: t.spacing.sm }}>
            <Text variant="heading">Admin</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(admin)/approvals')}
              testID="home-approvals"
            >
              <Row
                label="Approvals"
                value={
                  pending === null ? '' : pending === 0 ? 'none waiting' : `${pending} waiting`
                }
                trailing={
                  <Ionicons name="chevron-forward" size={t.spacing.xl} color={t.colors.sky} />
                }
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(admin)/members')}
              testID="home-members"
            >
              <Row
                label="Members and invites"
                trailing={
                  <Ionicons name="chevron-forward" size={t.spacing.xl} color={t.colors.sky} />
                }
              />
            </Pressable>
          </Card>
        ) : null}

        <Card dashed style={{ gap: t.spacing.sm }}>
          <Text variant="heading">Your vault</Text>
          <Row dashed label="Contacts" value="coming next" />
          <Row dashed label="Credentials" value="coming next" />
          <Row dashed label="Files" value="coming next" />
        </Card>

        <Callout>
          A daily PIN lock arrives with the next feature. Until then the vault key lives in memory
          only; closing the app means logging in again.
        </Callout>

        <Card style={{ gap: t.spacing.sm }}>
          <Text variant="heading">Account</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(app)/change-password')}
            testID="home-change-password"
          >
            <Row
              label="Change password"
              trailing={
                <Ionicons name="chevron-forward" size={t.spacing.xl} color={t.colors.sky} />
              }
            />
          </Pressable>
          <Button
            variant="ghost"
            onPress={() => signOut().finally(() => router.replace(pathFor('login')))}
            testID="home-sign-out"
          >
            Sign out
          </Button>
        </Card>
      </View>
    </Screen>
  );
}
