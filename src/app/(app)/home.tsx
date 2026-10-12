import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar, Badge, Button, Card, Row, Screen, Text } from '@/components/ui';
import { listPendingDevices, subscribePendingDevices } from '@/features/admin/api';
import { CONTACTS_HREF } from '@/features/contacts/routes';
import { CREDENTIALS_HREF } from '@/features/credentials/routes';
import { signOut } from '@/features/auth/api';
import { pathFor } from '@/features/auth/routes';
import { lockNow } from '@/features/lock/api';
import { useLock } from '@/features/lock/lock.store';
import { DEFAULT_TIMEOUT_MS, TIMEOUT_OPTIONS } from '@/features/lock/model';
import { readTimeoutMs, writeTimeoutMs } from '@/features/lock/storage';
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
  const [timeoutMs, setTimeoutMs] = useState<number>(DEFAULT_TIMEOUT_MS);
  const hasPin = useLock((s) => s.state === 'unlocked');
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    readTimeoutMs()
      .then(setTimeoutMs)
      .catch(() => undefined);
  }, []);

  const pickTimeout = (ms: number) => {
    setTimeoutMs(ms);
    writeTimeoutMs(ms).catch(() => undefined);
  };

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
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(admin)/show-kit')}
              testID="home-show-kit"
            >
              <Row
                label="Show my recovery kit"
                value="24 words"
                trailing={
                  <Ionicons name="chevron-forward" size={t.spacing.xl} color={t.colors.sky} />
                }
              />
            </Pressable>
          </Card>
        ) : null}

        <Card style={{ gap: t.spacing.sm }}>
          <Text variant="heading">Your vault</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(CONTACTS_HREF)}
            testID="home-contacts"
          >
            <Row
              label="Contacts"
              value="Call and WhatsApp"
              trailing={
                <Ionicons name="chevron-forward" size={t.spacing.xl} color={t.colors.sky} />
              }
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(CREDENTIALS_HREF)}
            testID="home-credentials"
          >
            <Row
              label="Credentials"
              value="Bank, email and more"
              trailing={
                <Ionicons name="chevron-forward" size={t.spacing.xl} color={t.colors.sky} />
              }
            />
          </Pressable>
          <Row dashed label="Files" value="coming next" />
        </Card>

        <Card style={{ gap: t.spacing.sm }}>
          <Text variant="heading">Security</Text>
          <Text variant="caption" color="muted">
            Lock after being away for
          </Text>
          <View
            accessibilityRole="radiogroup"
            style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}
          >
            {TIMEOUT_OPTIONS.map((o) => {
              const selected = o.ms === timeoutMs;
              return (
                <Pressable
                  key={o.ms}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  accessibilityLabel={`Lock after ${o.label}`}
                  onPress={() => pickTimeout(o.ms)}
                  testID={`timeout-${o.ms}`}
                  style={{
                    minHeight: t.sizes.touch,
                    paddingHorizontal: t.spacing.lg,
                    borderRadius: t.radii.pill,
                    justifyContent: 'center',
                    backgroundColor: selected ? t.colors.primary : t.colors.canvas,
                    borderWidth: t.sizes.hairline,
                    borderColor: selected ? t.colors.primary : t.colors.line,
                  }}
                >
                  <Text variant="label" color={selected ? 'onPrimary' : 'ink'}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(lock)/change-pin')}
            testID="home-change-pin"
          >
            <Row
              label="Change PIN"
              trailing={
                <Ionicons name="chevron-forward" size={t.spacing.xl} color={t.colors.sky} />
              }
            />
          </Pressable>
          <Button
            variant="secondary"
            onPress={lockNow}
            disabled={!hasPin}
            testID="home-lock-now"
            leading={<Ionicons name="lock-closed" size={t.sizes.icon} color={t.colors.primary} />}
          >
            Lock now
          </Button>
        </Card>

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
