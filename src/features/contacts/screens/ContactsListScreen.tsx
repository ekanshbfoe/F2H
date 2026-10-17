import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  SwipeToDelete,
  Text,
  TextField,
  confirm,
} from '@/components/ui';
import { useLock } from '@/features/lock/lock.store';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';
import { useSteadyRouter } from '@/hooks/useSteadyRouter';

import { saveToPhone } from '../export';
import { ImportError } from '../import';
import { formatPhone, visibleContacts, type StoredContact } from '../model';
import { CONTACTS_IMPORT_HREF, contactEditHref, contactHref } from '../routes';
import { useContacts } from '../store';

/**
 * Contacts (spec 0003, AC-1, AC-5, AC-9): one encrypted list, searchable by name or number. A row
 * swipes left to delete; a long press starts picking several, to delete them or save them into
 * the phone's own address book.
 */
export function ContactsListScreen() {
  const t = useTheme();
  const router = useSteadyRouter();
  const insets = useSafeAreaInsets();
  const unlocked = useSession((s) => s.mk !== null);
  const status = useContacts((s) => s.status);
  const items = useContacts((s) => s.items);
  const skipped = useContacts((s) => s.skipped);
  const offline = useContacts((s) => s.offline);
  const error = useContacts((s) => s.error);
  const load = useContacts((s) => s.load);
  const remove = useContacts((s) => s.remove);
  const removeMany = useContacts((s) => s.removeMany);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  // long press starts picking; the mode ends when the last one is unticked
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<'delete' | 'save' | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const picking = picked.length > 0;

  // the system back leaves picking before it leaves the screen
  useEffect(() => {
    if (!picking) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPicked([]);
      return true;
    });
    return () => sub.remove();
  }, [picking]);

  // a lock empties the list; ticks for contacts no longer shown would be stale
  useEffect(
    () =>
      useLock.subscribe((st, prev) => {
        if (st.generation !== prev.generation) setPicked([]);
      }),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (unlocked) void load();
    }, [unlocked, load]),
  );

  const all = useMemo(() => Object.values(items), [items]);
  const visible = useMemo(() => visibleContacts(all, query), [all, query]);

  const togglePick = (id: string) =>
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const startPick = (id: string) => {
    if (picking) return;
    void Haptics.selectionAsync();
    setMessage(null);
    setPicked([id]);
  };

  const chosen = () => picked.map((id) => items[id]).filter((c): c is StoredContact => Boolean(c));

  const confirmDelete = async (contact: StoredContact, keep: () => void) => {
    const ok = await confirm({
      title: 'Delete this contact?',
      message: `${contact.payload.name} leaves your vault. Your phone's own contacts are not touched.`,
    });
    if (!ok) {
      keep();
      return;
    }
    remove(contact).catch(() => {
      keep();
      setMessage({ tone: 'danger', text: 'Could not delete it. Check your connection.' });
    });
  };

  const deletePicked = async () => {
    const list = chosen();
    const n = list.length;
    if (n === 0) return;
    const ok = await confirm({
      title:
        n === all.length && n > 1
          ? `Delete all ${n} contacts?`
          : n === 1
            ? 'Delete this contact?'
            : `Delete ${n} contacts?`,
      message: `${n === 1 ? 'It leaves' : 'They leave'} your vault. Your phone's own contacts are not touched.`,
      confirmLabel: n === 1 ? 'Delete' : `Delete ${n}`,
    });
    if (!ok) return;
    setBusy('delete');
    setMessage(null);
    const { failed } = await removeMany(list);
    setBusy(null);
    setPicked(failed);
    if (failed.length > 0) {
      setMessage({
        tone: 'danger',
        text: `${failed.length} could not be deleted and ${failed.length === 1 ? 'is' : 'are'} still ticked. Check your connection and try again.`,
      });
    }
  };

  const savePicked = async () => {
    const list = chosen();
    if (list.length === 0) return;
    setBusy('save');
    setMessage(null);
    try {
      const r = await saveToPhone(list, (done, total) =>
        setProgress(`Saving ${done} of ${total}…`),
      );
      setPicked([]);
      const parts = [
        `${r.added} saved to this phone's contacts`,
        r.skipped > 0 ? `${r.skipped} already there` : null,
        r.failed > 0 ? `${r.failed} could not be saved` : null,
      ].filter(Boolean);
      setMessage({ tone: r.failed > 0 ? 'danger' : 'success', text: `${parts.join(', ')}.` });
    } catch (e) {
      setMessage({
        tone: 'danger',
        text:
          e instanceof ImportError && e.code === 'permission_denied'
            ? 'F2H needs permission to your contacts to save them. Allow it in the phone settings.'
            : "Could not read this phone's contacts. Try again.",
      });
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const refresh = () => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  };

  const header = (
    <View style={{ gap: t.spacing.lg, paddingBottom: t.spacing.md }}>
      {picking ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop picking"
            onPress={() => setPicked([])}
            hitSlop={12}
            testID="contacts-pick-cancel"
          >
            <Ionicons name="close" size={t.sizes.iconLg} color={t.colors.sky} />
          </Pressable>
          <Text
            variant="title"
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            style={{ flex: 1 }}
          >
            {`${picked.length} selected`}
          </Text>
          <Button
            variant="ghost"
            size="sm"
            fullWidth={false}
            onPress={() =>
              setPicked(picked.length === visible.length ? [] : visible.map((c) => c.id))
            }
            testID="contacts-pick-all"
          >
            {picked.length === visible.length ? 'None' : 'All'}
          </Button>
        </View>
      ) : (
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
      )}
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
      {message ? <Callout tone={message.tone}>{message.text}</Callout> : null}
      {progress ? (
        <Text variant="caption" color="muted" accessibilityLiveRegion="polite">
          {progress}
        </Text>
      ) : null}
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
    <>
      <FlatList
        style={{ flex: 1, backgroundColor: t.colors.canvas }}
        contentContainerStyle={{
          paddingTop: insets.top + t.spacing.xl,
          paddingBottom:
            insets.bottom + t.spacing.xxl + (picking ? t.sizes.buttonHeight + t.spacing.lg : 0),
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={t.colors.primary}
          />
        }
        renderItem={({ item }) => (
          <SwipeToDelete
            enabled={!offline && !picking}
            label={`Delete ${item.payload.name}`}
            onDelete={(keep) => void confirmDelete(item, keep)}
            testID={`contact-delete-${item.id}`}
          >
            <ContactRow
              contact={item}
              picking={picking}
              picked={picked.includes(item.id)}
              onPress={() => (picking ? togglePick(item.id) : router.push(contactHref(item.id)))}
              onLongPress={() => startPick(item.id)}
            />
          </SwipeToDelete>
        )}
        testID="contacts-list"
      />
      {picking ? (
        <Animated.View
          entering={FadeInDown.duration(t.motion.glideMs)}
          exiting={FadeOutDown.duration(t.motion.transitionMs)}
          style={{
            position: 'absolute',
            left: t.sizes.sheetInset,
            right: t.sizes.sheetInset,
            bottom: Math.max(insets.bottom, t.sizes.sheetInset),
            flexDirection: 'row',
            gap: t.spacing.sm,
          }}
        >
          <View style={{ flex: 1 }}>
            <Button
              variant="secondary"
              loading={busy === 'save'}
              disabled={busy !== null}
              onPress={() => void savePicked()}
              testID="contacts-pick-save"
              leading={
                <Ionicons
                  name="phone-portrait-outline"
                  size={t.sizes.icon}
                  color={t.colors.primary}
                />
              }
            >
              To phone
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              variant="danger"
              loading={busy === 'delete'}
              disabled={busy !== null || offline}
              onPress={() => void deletePicked()}
              testID="contacts-pick-delete"
              leading={
                <Ionicons name="trash-outline" size={t.sizes.icon} color={t.colors.onPrimary} />
              }
            >
              {`Delete ${picked.length}`}
            </Button>
          </View>
        </Animated.View>
      ) : null}
    </>
  );
}

function ContactRow({
  contact,
  picking,
  picked,
  onPress,
  onLongPress,
}: {
  contact: StoredContact;
  picking: boolean;
  picked: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const t = useTheme();
  const p = contact.payload;
  const first = p.phones[0];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${p.name}, ${first ? formatPhone(first.number) : ''}`}
      accessibilityState={picking ? { selected: picked } : undefined}
      accessibilityHint={picking ? undefined : 'Long press to pick several'}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      testID={`contact-row-${contact.id}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        padding: t.spacing.md,
        borderRadius: t.radii.lg,
        backgroundColor: pressed || picked ? t.colors.primaryTint : t.colors.surface,
        borderWidth: t.sizes.hairline,
        borderColor: picked ? t.colors.primary : t.colors.line,
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
      {picking ? (
        <Ionicons
          name={picked ? 'checkmark-circle' : 'ellipse-outline'}
          size={t.sizes.iconLg}
          color={picked ? t.colors.primary : t.colors.lineStrong}
        />
      ) : (
        <Ionicons name="chevron-forward" size={t.spacing.xl} color={t.colors.sky} />
      )}
    </Pressable>
  );
}
