import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, Button, Callout, Card, Text, TextField } from '@/components/ui';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';
import { useSteadyRouter } from '@/hooks/useSteadyRouter';

import { FilesError } from '../api';
import { formatSize, matchesSearch, sortFiles, type StoredFile } from '../model';
import { fileHref } from '../routes';
import { useFiles } from '../store';

function describe(e: unknown): string {
  const text = explain(e);
  // a development build adds the step and reason an upload stopped at; a release build never does
  if (!__DEV__) return text;
  const detail = e instanceof Error ? e.message : String(e);
  return detail && detail !== text ? `${text}\n\n(${detail})` : text;
}

function explain(e: unknown): string {
  const code = e instanceof FilesError ? e.code : null;
  switch (code) {
    case 'no_drive_linked':
      return 'No Google Drive is linked yet. The Admin links them from Home → Admin → Google Drives.';
    case 'too_large':
      return 'That file is larger than the vault accepts (2 GB).';
    case 'hash_mismatch':
      return 'Google stored a different file than this phone sent. Nothing was saved; try again.';
    default:
      return 'The upload did not finish. Check your connection and try again.';
  }
}

/** Files (child spec 0001-drive-redundancy, AC-10): list, badges, upload progress, states. */
export function FilesListScreen() {
  const t = useTheme();
  const router = useSteadyRouter();
  const insets = useSafeAreaInsets();
  const unlocked = useSession((s) => s.mk !== null);
  const { status, items, states, skipped, offline, error, upload, load, add } = useFiles();
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (unlocked) void load();
    }, [unlocked, load]),
  );

  const visible = useMemo(
    () => sortFiles(Object.values(items)).filter((f) => matchesSearch(f.payload, query)),
    [items, query],
  );

  const pick = async () => {
    setMessage(null);
    // no picker copy: the upload copies the file into the app's own scratch folder itself
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: false,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    try {
      const state = await add({
        uri: asset.uri,
        name: asset.name,
        mime: asset.mimeType ?? 'application/octet-stream',
        size: asset.size ?? 0,
      });
      setMessage({
        tone: 'success',
        text:
          state === 'ok'
            ? `${asset.name} is saved on both Drives.`
            : `${asset.name} is saved on one Drive. The nightly check copies it to the other.`,
      });
    } catch (e) {
      setMessage({ tone: 'danger', text: describe(e) });
    }
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
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          Files
        </Text>
        <Badge tone="primary">Two Drives</Badge>
      </View>
      <TextField
        label="Search"
        placeholder="File name"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        testID="files-search"
      />
      <Button
        size="sm"
        onPress={() => void pick()}
        disabled={upload !== null || !unlocked || offline}
        testID="files-add"
        leading={
          <Ionicons name="cloud-upload-outline" size={t.sizes.icon} color={t.colors.onPrimary} />
        }
      >
        Add a file
      </Button>
      {upload ? (
        <Card style={{ gap: t.spacing.sm }} testID="files-upload">
          <Text variant="label" numberOfLines={1}>
            {upload.name}
          </Text>
          <Text variant="caption" color="muted" accessibilityLiveRegion="polite">
            {upload.progress.phase === 'encrypting'
              ? 'Encrypting on this phone…'
              : upload.progress.phase === 'verifying'
                ? 'Checking both copies…'
                : `Drive A ${upload.progress.a === null ? 'skipped' : `${Math.round(upload.progress.a * 100)}%`} · Drive B ${upload.progress.b === null ? 'skipped' : `${Math.round(upload.progress.b * 100)}%`}`}
          </Text>
          <ActivityIndicator color={t.colors.primary} />
        </Card>
      ) : null}
      {message ? <Callout tone={message.tone}>{message.text}</Callout> : null}
      {offline ? (
        <Callout testID="files-offline">
          Offline, read only. You are seeing the copy this phone loaded last; adding and editing
          come back when the connection does.
        </Callout>
      ) : null}
      {skipped > 0 ? (
        <Callout>{`${skipped} item${skipped === 1 ? '' : 's'} could not be opened on this phone and ${skipped === 1 ? 'is' : 'are'} hidden.`}</Callout>
      ) : null}
      {status === 'error' ? (
        <Card style={{ gap: t.spacing.sm }}>
          <Callout tone="danger">{`Could not load your files: ${error ?? 'unknown error'}`}</Callout>
          <Button variant="secondary" size="sm" onPress={() => void load()}>
            Retry
          </Button>
        </Card>
      ) : null}
    </View>
  );

  const empty = !unlocked ? (
    <Callout>Unlock with your PIN to see your files.</Callout>
  ) : status === 'loading' || status === 'idle' ? (
    <View style={{ paddingVertical: t.spacing.huge, alignItems: 'center' }}>
      <ActivityIndicator color={t.colors.primary} accessibilityLabel="Loading files" />
    </View>
  ) : status === 'error' ? null : Object.keys(items).length === 0 ? (
    <Card dashed style={{ gap: t.spacing.md, alignItems: 'center' }} testID="files-empty">
      <Ionicons name="documents-outline" size={t.sizes.hero / 3} color={t.colors.sky} />
      <Text variant="heading" align="center">
        No files yet
      </Text>
      <Text variant="body" color="muted" align="center">
        Add documents, photos or PDFs. Each one is encrypted on this phone and kept on two Google
        Drives, so one can disappear without losing anything.
      </Text>
    </Card>
  ) : (
    <Text variant="body" color="muted" align="center" testID="files-no-results">
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
      keyExtractor={(f) => f.id}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
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
      renderItem={({ item }) => (
        <FileRow
          file={item}
          state={states[item.id]}
          onPress={() => router.push(fileHref(item.id))}
        />
      )}
      testID="files-list"
    />
  );
}

function FileRow({
  file,
  state,
  onPress,
}: {
  file: StoredFile;
  state?: string;
  onPress: () => void;
}) {
  const t = useTheme();
  const p = file.payload;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${p.name}, ${formatSize(p.size)}${state === 'degraded' ? ', one copy' : ''}`}
      onPress={onPress}
      testID={`file-row-${file.id}`}
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
      <Ionicons
        name={
          p.mime.startsWith('image/')
            ? 'image-outline'
            : p.mime === 'application/pdf'
              ? 'document-text-outline'
              : 'document-outline'
        }
        size={t.sizes.iconLg}
        color={t.colors.primary}
      />
      <View style={{ flex: 1, gap: t.spacing.xxs }}>
        <Text variant="label" numberOfLines={1}>
          {p.name}
        </Text>
        <Text variant="caption" color="muted">
          {`${formatSize(p.size)} · ${new Date(p.added_at).toLocaleDateString()}`}
        </Text>
      </View>
      {state === 'degraded' ? <Badge tone="warning">One copy</Badge> : null}
      {state === 'missing' ? <Badge tone="danger">Missing</Badge> : null}
    </Pressable>
  );
}
