import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Badge, Button, Callout, Card, Text, TextField } from '@/components/ui';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

import { formatPhone, visibleContacts, type StoredContact } from '../model';
import { CONTACTS_IMPORT_HREF, contactEditHref, contactHref } from '../routes';
import { useContacts } from '../store';

/** Contacts (spec 0003, AC-1, AC-5, AC-9): one encrypted list, searchable by name or number. */
export function ContactsListScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const unlocked = useSession((s) => s.mk !== null);
  const status = useContacts((s) => s.status);
  const items = useContacts((s) => s.items);
  const skipped = useContacts((s) => s.skipped);
  const offline = useContacts((s) => s.offline);
  const error = useContacts((s) => s.error);
  const load = useContacts((s) => s.load);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (unlocked) void load();
    }, [unlocked, load]),
  );

  const all = useMemo(() => Object.values(items), [items]);
  const visible = useMemo(() => visibleContacts(all, query), [all, query]);

  const refresh = () => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  };

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
        <View style={{ flex: 1 }}>
          <Text variant="title" accessibilityRole="header">
            Contacts
          </Text>
          {unlocked && status === 'ready' ? (
            <Text variant="caption" color="muted" testID="contacts-count">
              {`${all.length} saved`}
            </Text>
          ) : null}
        </View>
        <Badge tone="primary">Encrypted</Badge>
      </View>
      <TextField
        label="Search"
        placeholder="Name or at least 3 digits"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        testID="contacts-search"
      />
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button
            size="sm"
            onPress={() => router.push(contactEditHref())}
            disabled={offline}
            testID="contacts-add"
            leading={<Ionicons name="add" size={t.sizes.icon} color={t.colors.onPrimary} />}
          >
            Add
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => router.push(CONTACTS_IMPORT_HREF)}
            disabled={offline}
            testID="contacts-import"
            leading={
              <Ionicons name="download-outline" size={t.sizes.icon} color={t.colors.primary} />
            }
          >
            Import
          </Button>
        </View>
      </View>
      {offline ? (
        <Callout testID="contacts-offline">
          Offline, read only. You are seeing the copy this phone loaded last; adding and editing
          come back when the connection does.
        </Callout>
      ) : null}
      {skipped > 0 ? (
        <Callout>{`${skipped} item${skipped === 1 ? '' : 's'} could not be opened on this phone and ${skipped === 1 ? 'is' : 'are'} hidden.`}</Callout>
      ) : null}
      {status === 'error' ? (
        <Card style={{ gap: t.spacing.sm }}>
          <Callout tone="danger">{`Could not load your contacts: ${error ?? 'unknown error'}`}</Callout>
          <Button variant="secondary" size="sm" onPress={() => void load()}>
            Retry
          </Button>
        </Card>
      ) : null}
    </View>
  );

  const empty = !unlocked ? (
    <Callout>Unlock with your PIN to see your contacts.</Callout>
  ) : status === 'loading' || status === 'idle' ? (
    <View style={{ paddingVertical: t.spacing.huge, alignItems: 'center' }}>
      <ActivityIndicator color={t.colors.primary} accessibilityLabel="Loading contacts" />
    </View>
  ) : status === 'error' ? null : all.length === 0 ? (
    <Card dashed style={{ gap: t.spacing.md, alignItems: 'center' }} testID="contacts-empty">
      <Ionicons name="people-outline" size={t.sizes.hero / 3} color={t.colors.sky} />
      <Text variant="heading" align="center">
        No contacts yet
      </Text>
      <Text variant="body" color="muted" align="center">
        Add the numbers your family needs, or import them from this phone. They are encrypted before
        they leave it.
      </Text>
    </Card>
  ) : (
    <Text variant="body" color="muted" align="center" testID="contacts-no-results">
      {`Nothing matches "${query.trim()}".`}
    </Text>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: t.colors.canvas }}
      contentContainerStyle={{
        paddingTop: insets.top + t.spacing.xl,
        paddingBottom: insets.bottom + t.spacing.xxl,
        paddingHorizontal: t.sizes.sheetInset,
        gap: t.spacing.sm,
      }}
      data={unlocked && status === 'ready' ? visible : []}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={15}
      windowSize={7}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.colors.primary} />
      }
      renderItem={({ item }) => (
        <ContactRow contact={item} onPress={() => router.push(contactHref(item.id))} />
      )}
      testID="contacts-list"
    />
  );
}

function ContactRow({ contact, onPress }: { contact: StoredContact; onPress: () => void }) {
  const t = useTheme();
  const p = contact.payload;
  const first = p.phones[0];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${p.name}, ${first ? formatPhone(first.number) : ''}`}
      onPress={onPress}
      testID={`contact-row-${contact.id}`}
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
      <Avatar name={p.name} />
      <View style={{ flex: 1, gap: t.spacing.xxs }}>
        <Text variant="label" color="ink" numberOfLines={1}>
          {p.name}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {first ? `${formatPhone(first.number)} · ${first.label}` : ''}
          {p.phones.length > 1 ? ` · +${p.phones.length - 1}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={t.spacing.xl} color={t.colors.sky} />
    </Pressable>
  );
}
