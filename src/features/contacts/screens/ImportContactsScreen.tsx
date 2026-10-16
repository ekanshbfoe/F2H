import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, Button, Callout, Card, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import {
  ImportError,
  readDeviceContacts,
  toCandidates,
  toPayload,
  type Candidate,
} from '../import';
import { formatPhone, vaultNumbers } from '../model';
import { useContacts } from '../store';

type Phase =
  | { kind: 'intro' }
  | { kind: 'reading' }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'failed' }
  | { kind: 'review'; candidates: Candidate[]; capped: boolean }
  | { kind: 'saving'; done: number; total: number }
  | { kind: 'done'; count: number; failedAfter?: number };

/** Import from this phone (spec 0003, AC-4): permission, review and pick, batched save. */
export function ImportContactsScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const status = useContacts((s) => s.status);
  const load = useContacts((s) => s.load);
  const saveMany = useContacts((s) => s.saveMany);
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const start = async () => {
    setPhase({ kind: 'reading' });
    try {
      if (status !== 'ready') await load();
      const known = vaultNumbers(Object.values(useContacts.getState().items));
      const { entries, capped } = await readDeviceContacts();
      setSelected(new Set());
      setPhase({ kind: 'review', candidates: toCandidates(entries, known), capped });
    } catch (e) {
      if (e instanceof ImportError && e.code === 'permission_denied') {
        setPhase({ kind: 'denied', canAskAgain: e.canAskAgain });
      } else {
        setPhase({ kind: 'failed' });
      }
    }
  };

  const review = phase.kind === 'review' ? phase : null;
  const selectable = useMemo(
    () => (review ? review.candidates.filter((c) => !c.duplicate) : []),
    [review],
  );

  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allOn = selectable.length > 0 && selectable.every((c) => selected.has(c.key));

  const save = async () => {
    if (!review) return;
    const picked = review.candidates.filter((c) => selected.has(c.key) && !c.duplicate);
    const payloads = picked.map(toPayload);
    setPhase({ kind: 'saving', done: 0, total: payloads.length });
    try {
      const n = await saveMany(payloads, (done) =>
        setPhase({ kind: 'saving', done, total: payloads.length }),
      );
      setPhase({ kind: 'done', count: n });
    } catch (e) {
      const landed = (e as { landed?: number }).landed ?? 0;
      setPhase({ kind: 'done', count: landed, failedAfter: payloads.length - landed });
    }
  };

  const pad = {
    paddingTop: insets.top + t.spacing.xl,
    paddingHorizontal: t.sizes.sheetInset,
    gap: t.spacing.lg,
  };

  const title = (
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
        Import from phone
      </Text>
    </View>
  );

  if (!review) {
    return (
      <View style={[{ flex: 1, backgroundColor: t.colors.canvas }, pad]}>
        {title}
        {phase.kind === 'intro' || phase.kind === 'reading' ? (
          <Card style={{ gap: t.spacing.md }}>
            <Badge tone="primary">Stays on this phone until you pick</Badge>
            <Text variant="body" color="muted">
              F2H reads names and numbers from this phone&apos;s address book so you can choose
              which to keep in your vault. Only the ones you pick are saved, encrypted. Nothing else
              leaves the phone.
            </Text>
            <Button
              onPress={() => void start()}
              loading={phase.kind === 'reading'}
              testID="import-start"
            >
              Read my contacts
            </Button>
          </Card>
        ) : null}
        {phase.kind === 'denied' ? (
          <Card style={{ gap: t.spacing.md }} testID="import-denied">
            <Callout tone="danger">F2H does not have permission to read your contacts.</Callout>
            <Text variant="body" color="muted">
              {phase.canAskAgain
                ? 'Tap Try again and allow access, or add contacts by hand instead.'
                : 'Android will not ask again. Open settings, allow Contacts for this app, then come back.'}
            </Text>
            {phase.canAskAgain ? (
              <Button onPress={() => void start()}>Try again</Button>
            ) : (
              <Button onPress={() => void Linking.openSettings()} testID="import-settings">
                Open settings
              </Button>
            )}
          </Card>
        ) : null}
        {phase.kind === 'failed' ? (
          <Card style={{ gap: t.spacing.md }}>
            <Callout tone="danger">Could not read the address book on this phone.</Callout>
            <Button variant="secondary" onPress={() => void start()}>
              Retry
            </Button>
          </Card>
        ) : null}
        {phase.kind === 'saving' ? (
          <Card style={{ gap: t.spacing.md }} testID="import-saving">
            <Text variant="heading">Encrypting and saving</Text>
            <Text variant="body" color="muted" accessibilityLiveRegion="polite">
              {`${phase.done} of ${phase.total} saved`}
            </Text>
          </Card>
        ) : null}
        {phase.kind === 'done' ? (
          <Card style={{ gap: t.spacing.md }} testID="import-done">
            <Badge tone={phase.failedAfter ? 'warning' : 'success'}>
              {`${phase.count} contact${phase.count === 1 ? '' : 's'} imported`}
            </Badge>
            {phase.failedAfter ? (
              <Callout tone="danger">
                {`${phase.failedAfter} could not be saved. Check your connection and import again; the saved ones will show as already in your vault.`}
              </Callout>
            ) : null}
            <Button onPress={() => router.back()} testID="import-finish">
              Back to contacts
            </Button>
          </Card>
        ) : null}
      </View>
    );
  }

  const dupes = review.candidates.length - selectable.length;
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.canvas }}>
      <FlatList
        contentContainerStyle={[pad, { paddingBottom: t.spacing.xxl, gap: t.spacing.sm }]}
        data={review.candidates}
        keyExtractor={(c) => c.key}
        initialNumToRender={20}
        windowSize={7}
        ListHeaderComponent={
          <View style={{ gap: t.spacing.md, paddingBottom: t.spacing.sm }}>
            {title}
            <Text variant="body" color="muted">
              {`${review.candidates.length} contacts with a number${dupes > 0 ? `, ${dupes} already in your vault` : ''}.`}
            </Text>
            {review.capped ? (
              <Callout>{`Only the first ${review.candidates.length} entries were read to keep this phone fast.`}</Callout>
            ) : null}
            {selectable.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onPress={() =>
                  setSelected(allOn ? new Set() : new Set(selectable.map((c) => c.key)))
                }
                testID="import-select-all"
              >
                {allOn ? 'Select none' : `Select all ${selectable.length}`}
              </Button>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Card dashed testID="import-empty">
            <Text variant="body" color="muted" align="center">
              No contact on this phone has a phone number.
            </Text>
          </Card>
        }
        renderItem={({ item }) => {
          const on = selected.has(item.key);
          const first = item.phones[0];
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: item.duplicate }}
              accessibilityLabel={`${item.name}${item.duplicate ? ', already in your vault' : ''}`}
              disabled={item.duplicate}
              onPress={() => toggle(item.key)}
              testID={`import-row-${item.key}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                padding: t.spacing.md,
                borderRadius: t.radii.lg,
                backgroundColor: item.duplicate ? t.colors.canvas : t.colors.surface,
                borderWidth: t.sizes.hairline,
                borderColor: on ? t.colors.primary : t.colors.line,
                opacity: item.duplicate ? 0.6 : 1,
              }}
            >
              <Ionicons
                name={item.duplicate ? 'checkmark-done' : on ? 'checkbox' : 'square-outline'}
                size={t.sizes.iconLg}
                color={item.duplicate ? t.colors.muted : t.colors.primary}
              />
              <View style={{ flex: 1 }}>
                <Text variant="label" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="caption" color="muted" numberOfLines={1}>
                  {item.duplicate
                    ? 'Already in your vault'
                    : `${first ? formatPhone(first.number) : ''}${item.phones.length > 1 ? ` · +${item.phones.length - 1}` : ''}`}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
      <View
        style={{
          paddingHorizontal: t.sizes.sheetInset,
          paddingTop: t.spacing.md,
          paddingBottom: insets.bottom + t.spacing.lg,
          backgroundColor: t.colors.canvas,
        }}
      >
        <Button onPress={() => void save()} disabled={selected.size === 0} testID="import-save">
          {selected.size === 0 ? 'Pick contacts to import' : `Import ${selected.size}`}
        </Button>
      </View>
    </View>
  );
}
