import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, Button, Callout, Card, Text, TextField } from '@/components/ui';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

import { categoryCounts, hostOf, toSections, type Category, type StoredCredential } from '../model';
import { credentialEditHref, credentialHref } from '../routes';
import { useCredentials } from '../store';

const ICON: Record<Category, keyof typeof Ionicons.glyphMap> = {
  bank: 'business-outline',
  email: 'mail-outline',
  other: 'key-outline',
};

/** Credentials (spec 0004, AC-1, AC-9): Bank, Email and Other sections over one encrypted list. */
export function CredentialsListScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const unlocked = useSession((s) => s.mk !== null);
  const status = useCredentials((s) => s.status);
  const items = useCredentials((s) => s.items);
  const skipped = useCredentials((s) => s.skipped);
  const error = useCredentials((s) => s.error);
  const load = useCredentials((s) => s.load);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (unlocked) void load();
    }, [unlocked, load]),
  );

  const all = useMemo(() => Object.values(items), [items]);
  const sections = useMemo(() => toSections(all, query), [all, query]);
  const counts = useMemo(() => categoryCounts(all), [all]);

  const header = (
    <View style={{ gap: t.spacing.lg, paddingBottom: t.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={t.sizes.iconLg} color={t.colors.sky} />
        </Pressable>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          Credentials
        </Text>
        <Badge tone="primary">Encrypted</Badge>
      </View>
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        <Badge tone="neutral">{`Bank ${counts.bank}`}</Badge>
        <Badge tone="neutral">{`Email ${counts.email}`}</Badge>
        <Badge tone="neutral">{`Other ${counts.other}`}</Badge>
      </View>
      <TextField
        label="Search"
        placeholder="Title, username or website"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        testID="credentials-search"
      />
      <Button
        size="sm"
        onPress={() => router.push(credentialEditHref())}
        testID="credentials-add"
        leading={<Ionicons name="add" size={t.sizes.icon} color={t.colors.onPrimary} />}
      >
        Add a credential
      </Button>
      {skipped > 0 ? (
        <Callout>{`${skipped} item${skipped === 1 ? '' : 's'} could not be opened on this phone and ${skipped === 1 ? 'is' : 'are'} hidden.`}</Callout>
      ) : null}
      {status === 'error' ? (
        <Card style={{ gap: t.spacing.sm }}>
          <Callout tone="danger">{`Could not load your credentials: ${error ?? 'unknown error'}`}</Callout>
          <Button variant="secondary" size="sm" onPress={() => void load()}>
            Retry
          </Button>
        </Card>
      ) : null}
    </View>
  );

  const empty = !unlocked ? (
    <Callout>Unlock with your PIN to see your credentials.</Callout>
  ) : status === 'loading' || status === 'idle' ? (
    <View style={{ paddingVertical: t.spacing.huge, alignItems: 'center' }}>
      <ActivityIndicator color={t.colors.primary} accessibilityLabel="Loading credentials" />
    </View>
  ) : status === 'error' ? null : all.length === 0 ? (
    <Card dashed style={{ gap: t.spacing.md, alignItems: 'center' }} testID="credentials-empty">
      <Ionicons name="lock-closed-outline" size={t.sizes.hero / 3} color={t.colors.sky} />
      <Text variant="heading" align="center">
        No credentials yet
      </Text>
      <Text variant="body" color="muted" align="center">
        Keep bank logins, email accounts and other secrets here. They are encrypted on this phone,
        and passwords stay hidden until you reveal them.
      </Text>
    </Card>
  ) : (
    <Text variant="body" color="muted" align="center" testID="credentials-no-results">
      {`Nothing matches "${query.trim()}".`}
    </Text>
  );

  return (
    <SectionList
      style={{ flex: 1, backgroundColor: t.colors.canvas }}
      contentContainerStyle={{
        paddingTop: insets.top + t.spacing.xl,
        paddingBottom: insets.bottom + t.spacing.xxl,
        paddingHorizontal: t.sizes.sheetInset,
        gap: t.spacing.sm,
      }}
      sections={unlocked && status === 'ready' ? sections : []}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load().finally(() => setRefreshing(false));
          }}
          tintColor={t.colors.primary}
        />
      }
      renderSectionHeader={({ section }) => (
        <Text
          variant="label"
          color="primary"
          accessibilityRole="header"
          style={{ paddingTop: t.spacing.md }}
        >
          {`${section.title} · ${section.data.length}`}
        </Text>
      )}
      renderItem={({ item }) => (
        <CredentialRow credential={item} onPress={() => router.push(credentialHref(item.id))} />
      )}
      testID="credentials-list"
    />
  );
}

function CredentialRow({
  credential,
  onPress,
}: {
  credential: StoredCredential;
  onPress: () => void;
}) {
  const t = useTheme();
  const p = credential.payload;
  const sub = p.username ?? hostOf(p.url ?? '');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={p.title}
      onPress={onPress}
      testID={`credential-row-${credential.id}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        padding: t.spacing.md,
        borderRadius: t.radii.lg,
        backgroundColor: pressed ? t.colors.primaryTint : t.colors.surface,
        borderWidth: t.sizes.hairline,
        borderColor: t.colors.line,
      })}
    >
      <Ionicons name={ICON[p.category]} size={t.sizes.iconLg} color={t.colors.primary} />
      <View style={{ flex: 1, gap: t.spacing.xxs }}>
        <Text variant="label" numberOfLines={1}>
          {p.title}
        </Text>
        {sub ? (
          <Text variant="caption" color="muted" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={t.spacing.xl} color={t.colors.sky} />
    </Pressable>
  );
}
