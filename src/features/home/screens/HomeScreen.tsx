import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LENS_BAR_HEIGHT, LensTabBar, type LensTab } from '@/components/motion/LensTabBar';
import { Avatar, Badge, Choice, NavGroup, NavRow, Text } from '@/components/ui';
import { CategoryTile } from '@/components/vault/CategoryTile';
import { listPendingDevices, subscribePendingDevices } from '@/features/admin/api';
import { ACTIVITY_HREF } from '@/features/audit/routes';
import { signOut } from '@/features/auth/api';
import { pathFor } from '@/features/auth/routes';
import { BACKUPS_HREF } from '@/features/backups/routes';
import { CONTACTS_HREF } from '@/features/contacts/routes';
import { useContacts } from '@/features/contacts/store';
import { CREDENTIALS_HREF } from '@/features/credentials/routes';
import { useCredentials } from '@/features/credentials/store';
import { DRIVE_HREF, FILES_HREF } from '@/features/files/routes';
import { useFiles } from '@/features/files/store';
import { lockNow } from '@/features/lock/api';
import { useLock } from '@/features/lock/lock.store';
import { DEFAULT_TIMEOUT_MS, TIMEOUT_OPTIONS } from '@/features/lock/model';
import { readTimeoutMs, writeTimeoutMs } from '@/features/lock/storage';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

type Tab = 'vault' | 'family' | 'settings';

/** Room the floating tab bar takes at the bottom of every page. */
const BAR_SPACE = LENS_BAR_HEIGHT + 4 + 24;

/**
 * Home: three pages behind a floating tab bar. Vault comes first and is where every visit
 * starts; Family (the Admin's tools, Admin only) and Settings (security and account) hold the
 * rest. The round button beside the bar locks the vault at once.
 */
export function HomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useSession((s) => s.profile);
  const isAdmin = profile?.role === 'admin';
  const hasPin = useLock((s) => s.state === 'unlocked');
  const [tab, setTab] = useState<Tab>('vault');
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) return undefined;
    const load = () =>
      listPendingDevices()
        .then((d) => setPending(d.length))
        .catch(() => setPending(null));
    load();
    return subscribePendingDevices(load);
  }, [isAdmin]);

  // back from another page returns to the vault before it leaves the app
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'vault') return false;
      setTab('vault');
      return true;
    });
    return () => sub.remove();
  }, [tab]);

  const tabs: LensTab[] = [
    { key: 'vault', label: 'Vault', icon: 'file-tray-full-outline', activeIcon: 'file-tray-full' },
    ...(isAdmin
      ? [
          {
            key: 'family',
            label: 'Family',
            icon: 'people-outline',
            activeIcon: 'people',
            badge: pending ?? 0,
          } as const,
        ]
      : []),
    { key: 'settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.canvas }}>
      <ScrollView
        key={tab}
        contentContainerStyle={{
          paddingTop: insets.top + t.spacing.xl,
          paddingBottom: insets.bottom + BAR_SPACE + t.spacing.lg,
          paddingHorizontal: t.sizes.sheetInset,
          gap: t.spacing.xl,
        }}
      >
        {tab === 'vault' ? (
          <VaultPage pending={isAdmin ? pending : null} onAccount={() => setTab('settings')} />
        ) : tab === 'family' && isAdmin ? (
          <FamilyPage pending={pending} />
        ) : (
          <SettingsPage />
        )}
      </ScrollView>
      <View
        style={{
          position: 'absolute',
          left: t.sizes.sheetInset,
          right: t.sizes.sheetInset,
          bottom: insets.bottom + t.spacing.md,
        }}
      >
        <LensTabBar
          tabs={tabs}
          value={tab}
          onChange={(key) => setTab(key as Tab)}
          action={{
            icon: 'lock-closed',
            label: 'Lock now',
            onPress: lockNow,
            disabled: !hasPin,
            testID: 'home-lock-now',
          }}
          testID="home-tabs"
        />
      </View>
    </View>
  );
}

function PageHeader({
  title,
  subtitle,
  side,
}: {
  title: string;
  subtitle: string;
  side?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
      {side}
      <View style={{ flex: 1, gap: t.spacing.xxs }}>
        <Text variant="title" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="body" color="muted" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

const BEAR = require('../../../../assets/images/bear.png');
/** The cut out bear's height over its width. */
const BEAR_RATIO = 109 / 96;

/**
 * The vault's top bar, icons only: the family bear on the left (who this app belongs to) and
 * your own initial on the right, which opens Settings.
 */
function VaultBar({ name, onAccount }: { name: string; onAccount: () => void }) {
  const t = useTheme();
  const badge = t.sizes.touch + t.spacing.xs;
  const bear = Math.round(badge * 0.84);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      {/* the bear peeks up out of a blue coin, its arms resting on the rim */}
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel="F2H family vault"
        style={[
          t.shadows.raised,
          {
            width: badge,
            height: badge,
            borderRadius: t.radii.pill,
            backgroundColor: t.colors.primary,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'flex-end',
          },
        ]}
      >
        <Image
          source={BEAR}
          style={{
            width: bear,
            height: Math.round(bear * BEAR_RATIO),
            marginBottom: -t.spacing.xs,
          }}
          resizeMode="contain"
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Your account, ${name}`}
        onPress={onAccount}
        hitSlop={t.spacing.xs}
        testID="home-account"
      >
        <Avatar name={name} />
      </Pressable>
    </View>
  );
}

function VaultPage({ pending, onAccount }: { pending: number | null; onAccount: () => void }) {
  const t = useTheme();
  const router = useRouter();
  const profile = useSession((s) => s.profile);
  // vault summary (spec 0007, AC-4): counts only once a list loaded on this phone
  const contacts = useContacts((s) => (s.status === 'ready' ? Object.keys(s.items).length : null));
  const credentials = useCredentials((s) =>
    s.status === 'ready' ? Object.keys(s.items).length : null,
  );
  const files = useFiles((s) => (s.status === 'ready' ? Object.keys(s.items).length : null));
  const saved = (n: number | null, hint: string) => (n === null ? hint : `${n} saved`);
  const name = profile?.display_name ?? 'F2H';

  return (
    <>
      <VaultBar name={name} onAccount={onAccount} />
      {pending ? (
        <NavGroup>
          <NavRow
            icon="phone-portrait-outline"
            tone="warning"
            title={pending === 1 ? 'A phone is waiting' : `${pending} phones are waiting`}
            subtitle="Check it before you approve"
            onPress={() => router.push('/(admin)/approvals')}
            testID="home-pending"
          />
        </NavGroup>
      ) : null}
      <View style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <CategoryTile
            icon="people"
            tone="sky"
            title="Contacts"
            detail={saved(contacts, 'Names and numbers')}
            onPress={() => router.push(CONTACTS_HREF)}
            testID="home-contacts"
          />
          <CategoryTile
            icon="key"
            title="Passwords"
            detail={saved(credentials, 'Bank, email and more')}
            onPress={() => router.push(CREDENTIALS_HREF)}
            testID="home-credentials"
          />
        </View>
        <View style={{ flexDirection: 'row' }}>
          <CategoryTile
            icon="document-text"
            tone="warning"
            title="Files"
            detail={saved(files, 'Kept on two Drives')}
            wide
            onPress={() => router.push(FILES_HREF)}
            testID="home-files"
          />
        </View>
      </View>
    </>
  );
}

function FamilyPage({ pending }: { pending: number | null }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <>
      <PageHeader title="Family" subtitle="Only the Admin sees this page" />
      <NavGroup title="People">
        <NavRow
          icon="phone-portrait-outline"
          tone="warning"
          title="Approvals"
          subtitle={
            pending === null
              ? 'New phones ask here'
              : pending === 0
                ? 'None waiting'
                : 'Waiting for you'
          }
          trailing={pending ? <Badge tone="danger">{String(pending)}</Badge> : undefined}
          onPress={() => router.push('/(admin)/approvals')}
          testID="home-approvals"
        />
        <NavRow
          icon="people-outline"
          title="Members and invites"
          subtitle="Who is in the family vault"
          onPress={() => router.push('/(admin)/members')}
          testID="home-members"
        />
      </NavGroup>
      <NavGroup title="Safety">
        <NavRow
          icon="cloud-outline"
          tone="sky"
          title="Google Drives"
          subtitle="Two copies of every file"
          onPress={() => router.push(DRIVE_HREF)}
          testID="home-drive"
        />
        <NavRow
          icon="archive-outline"
          tone="sky"
          title="Backups"
          subtitle="Sealed to the paper kit"
          onPress={() => router.push(BACKUPS_HREF)}
          testID="home-backups"
        />
        <NavRow
          icon="key-outline"
          tone="success"
          title="Recovery kit"
          subtitle="Your 24 words"
          onPress={() => router.push('/(admin)/show-kit')}
          testID="home-show-kit"
        />
      </NavGroup>
      <View style={{ height: t.spacing.xs }} />
    </>
  );
}

function SettingsPage() {
  const t = useTheme();
  const router = useRouter();
  const [timeoutMs, setTimeoutMs] = useState<number>(DEFAULT_TIMEOUT_MS);

  useEffect(() => {
    readTimeoutMs()
      .then(setTimeoutMs)
      .catch(() => undefined);
  }, []);

  const pickTimeout = (ms: number) => {
    setTimeoutMs(ms);
    writeTimeoutMs(ms).catch(() => undefined);
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="This phone and your account" />
      <View style={{ gap: t.spacing.sm }}>
        <Text
          variant="caption"
          color="muted"
          accessibilityRole="header"
          style={{ paddingHorizontal: t.spacing.xs }}
        >
          LOCK AFTER BEING AWAY FOR
        </Text>
        <Choice
          options={TIMEOUT_OPTIONS.map((o) => ({
            value: o.ms,
            label: o.label,
            accessibilityLabel: `Lock after ${o.label}`,
          }))}
          value={timeoutMs}
          onChange={pickTimeout}
          accessibilityLabel="Lock after being away for"
          testID="timeout"
        />
      </View>
      <NavGroup title="Security">
        <NavRow
          icon="keypad-outline"
          title="Change PIN"
          subtitle="The six digits that open this phone"
          onPress={() => router.push('/(lock)/change-pin')}
          testID="home-change-pin"
        />
        <NavRow
          icon="lock-closed-outline"
          title="Change password"
          subtitle="For signing in on a new phone"
          onPress={() => router.push('/(app)/change-password')}
          testID="home-change-password"
        />
      </NavGroup>
      <NavGroup title="Account">
        <NavRow
          icon="time-outline"
          tone="sky"
          title="Activity"
          subtitle="Who did what, and when"
          onPress={() => router.push(ACTIVITY_HREF)}
          testID="home-activity"
        />
        <NavRow
          icon="log-out-outline"
          title="Sign out"
          destructive
          onPress={() => signOut().finally(() => router.replace(pathFor('login')))}
          testID="home-sign-out"
        />
      </NavGroup>
    </>
  );
}
