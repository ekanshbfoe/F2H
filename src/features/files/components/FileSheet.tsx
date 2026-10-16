import { Ionicons } from '@expo/vector-icons';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { BloomMenu, type BloomRow } from '@/components/motion';
import { Button, Callout, Sheet, Text, confirm } from '@/components/ui';
import { useScreenCaptureBlock } from '@/features/lock/hooks';
import { useTheme } from '@/theme';

import { FilesError } from '../api';
import {
  AUTO_OPEN_MAX,
  formatSize,
  previewKind,
  typeLabel,
  viewerMime,
  type BlobState,
  type PreviewKind,
  type StoredFile,
} from '../model';
import { openWith, share } from '../open-with';
import { useFiles } from '../store';
import { AudioPreview, VideoPreview } from './MediaViews';
import { PdfView } from './PdfView';
import { ZoomImage } from './ZoomImage';

export interface FileSheetProps {
  /** The file to show; null closes the sheet. */
  file: StoredFile | null;
  state?: BlobState;
  onClose: () => void;
}

/**
 * One file in a tall sheet over the list (child spec 0001-drive-redundancy, AC-9, AC-11). Photos
 * and short text are decrypted and shown in place; anything else opens in another app. The
 * details and actions bloom out of the corner button.
 */
export function FileSheet({ file, state, onClose }: FileSheetProps) {
  // keep the last file on screen while the sheet slides away
  const [shown, setShown] = useState(file);
  if (file && file !== shown) setShown(file);
  return (
    <Sheet
      tall
      open={file !== null}
      onClose={onClose}
      title={shown?.payload.name ?? 'File'}
      testID="file-sheet"
    >
      {shown ? <FileViewer key={shown.id} file={shown} state={state} onClose={onClose} /> : null}
    </Sheet>
  );
}

type Preview =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; uri: string; text?: string }
  | { status: 'error'; message: string }
  | { status: 'none'; note?: string };

function explain(e: unknown): string {
  const code = e instanceof FilesError ? e.code : null;
  if (code === 'hash_mismatch') {
    return 'The copy on Drive does not match what was saved, so it was not opened. The nightly check repairs it from the other Drive.';
  }
  if (code === 'no_healthy_copy') return 'Neither Drive has a good copy right now. Tell the Admin.';
  return 'Could not download the file. Check your connection and try again.';
}

const BACKUP: Record<BlobState, string> = {
  ok: 'Both Drives',
  degraded: 'One Drive',
  missing: 'Missing',
  uploading: 'Uploading',
};

const KIND_ICON: Record<PreviewKind, React.ComponentProps<typeof Ionicons>['name']> = {
  image: 'image-outline',
  text: 'document-text-outline',
  pdf: 'document-text-outline',
  video: 'film-outline',
  audio: 'musical-notes-outline',
  other: 'document-outline',
};

const SHOW_LABEL: Record<Exclude<PreviewKind, 'other'>, string> = {
  image: 'Show photo',
  text: 'Show text',
  pdf: 'Open PDF',
  video: 'Play video',
  audio: 'Play',
};

function FileViewer({
  file,
  state,
  onClose,
}: {
  file: StoredFile;
  state?: BlobState;
  onClose: () => void;
}) {
  const t = useTheme();
  useScreenCaptureBlock('f2h:file');
  const openCopy = useFiles((s) => s.openCopy);
  const remove = useFiles((s) => s.remove);
  const offline = useFiles((s) => s.offline);
  const p = file.payload;
  const mime = viewerMime(p);
  const kind = previewKind(p);
  // small files open by themselves; a big one waits for a tap, so the sheet itself is instant
  const [preview, setPreview] = useState<Preview>(
    kind === 'other'
      ? { status: 'none' }
      : p.size <= AUTO_OPEN_MAX
        ? { status: 'loading' }
        : { status: 'idle' },
  );
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<'open' | 'share' | 'delete' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const loading = preview.status === 'loading';

  useEffect(() => {
    if (!loading) return undefined;
    let live = true;
    openCopy(file)
      .then(async (uri) => {
        const text = kind === 'text' ? await new File(uri).text() : undefined;
        if (live) setPreview({ status: 'ready', uri, text });
      })
      .catch((e: unknown) => {
        if (live) setPreview({ status: 'error', message: explain(e) });
      });
    return () => {
      live = false;
    };
  }, [file, kind, openCopy, loading]);

  const pdfFailed = useCallback(
    () =>
      setPreview({
        status: 'none',
        note: 'This PDF could not be drawn here. Open it in another app instead.',
      }),
    [],
  );

  const hand = async (how: 'open' | 'share') => {
    setMenu(false);
    setBusy(how);
    setMessage(null);
    try {
      const uri = await openCopy(file);
      const ok = how === 'open' ? await openWith(uri, mime) : await share(uri, mime);
      if (!ok) setMessage('Nothing on this phone can open this kind of file.');
    } catch (e) {
      setMessage(explain(e));
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = async () => {
    setMenu(false);
    const ok = await confirm({
      title: 'Delete this file?',
      message: `${p.name} goes to the trash on both Drives.`,
    });
    if (!ok) return;
    setBusy('delete');
    remove(file)
      .then(onClose)
      .catch(() => {
        setBusy(null);
        setMessage('Could not delete it. Check your connection.');
      });
  };

  const rows: BloomRow[] = [
    { key: 'size', label: 'Size', value: formatSize(p.size) },
    { key: 'type', label: 'Type', value: typeLabel(mime) },
    {
      key: 'added',
      label: 'Added',
      value: new Date(p.added_at).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    },
    ...(state ? [{ key: 'backup', label: 'Backed up', value: BACKUP[state] }] : []),
  ];

  const ready = preview.status === 'ready' ? preview : null;

  return (
    <View style={styles.fill}>
      <View
        style={[
          styles.fill,
          {
            borderRadius: t.radii.lg,
            backgroundColor: t.colors.canvas,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        {ready && kind === 'image' ? <ZoomImage uri={ready.uri} label={p.name} /> : null}
        {ready && kind === 'text' ? (
          <ScrollView
            style={StyleSheet.absoluteFill}
            contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.huge }}
          >
            <Text variant="body" color="ink" testID="file-text">
              {ready.text ?? ''}
            </Text>
          </ScrollView>
        ) : null}
        {ready && kind === 'pdf' ? <PdfView uri={ready.uri} onFail={pdfFailed} /> : null}
        {ready && kind === 'video' ? <VideoPreview uri={ready.uri} label={p.name} /> : null}
        {ready && kind === 'audio' ? <AudioPreview uri={ready.uri} name={p.name} /> : null}
        {loading ? (
          <View style={{ alignItems: 'center', gap: t.spacing.sm }}>
            <ActivityIndicator color={t.colors.primary} />
            <Text variant="caption" color="muted">
              Decrypting on this phone…
            </Text>
          </View>
        ) : null}
        {preview.status === 'error' ? (
          <View style={{ padding: t.spacing.lg, gap: t.spacing.md, alignSelf: 'stretch' }}>
            <Callout tone="danger">{preview.message}</Callout>
            <Button variant="secondary" size="sm" onPress={() => setPreview({ status: 'loading' })}>
              Try again
            </Button>
          </View>
        ) : null}
        {preview.status === 'idle' || preview.status === 'none' ? (
          <View style={{ alignItems: 'center', gap: t.spacing.md, padding: t.spacing.xl }}>
            <Ionicons name={KIND_ICON[kind]} size={t.sizes.hero / 2} color={t.colors.primary} />
            <Text variant="heading" align="center" numberOfLines={2}>
              {p.name}
            </Text>
            <Text variant="caption" color="muted" align="center">
              {`${typeLabel(mime)} · ${formatSize(p.size)}`}
            </Text>
            {preview.status === 'idle' && kind !== 'other' ? (
              <>
                <Button
                  size="sm"
                  fullWidth={false}
                  onPress={() => setPreview({ status: 'loading' })}
                  testID="file-show"
                >
                  {SHOW_LABEL[kind]}
                </Button>
                <Text variant="caption" color="muted" align="center">
                  A big file takes a while to decrypt on this phone.
                </Text>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  fullWidth={false}
                  loading={busy === 'open'}
                  disabled={busy !== null}
                  onPress={() => void hand('open')}
                  testID="file-open"
                >
                  Open with…
                </Button>
                <Text variant="caption" color="muted" align="center">
                  {preview.status === 'none' && preview.note
                    ? preview.note
                    : 'This kind of file opens in another app on this phone. The decrypted copy is deleted when the vault locks.'}
                </Text>
              </>
            )}
          </View>
        ) : null}
        <View style={[StyleSheet.absoluteFill, { padding: t.spacing.md }]} pointerEvents="box-none">
          <View style={styles.fill} pointerEvents="box-none">
            <BloomMenu
              open={menu}
              onOpenChange={setMenu}
              rows={rows}
              label="File details"
              testID="file-menu"
              actions={[
                {
                  key: 'open',
                  icon: 'open-outline',
                  label: 'Open with another app',
                  onPress: () => void hand('open'),
                  disabled: busy !== null,
                },
                {
                  key: 'share',
                  icon: 'share-outline',
                  label: 'Share',
                  onPress: () => void hand('share'),
                  disabled: busy !== null,
                },
                {
                  key: 'delete',
                  icon: 'trash-outline',
                  label: 'Delete',
                  tone: 'danger',
                  onPress: () => void confirmDelete(),
                  disabled: busy !== null || offline,
                },
              ]}
            />
          </View>
        </View>
      </View>
      {message ? (
        <View style={{ marginTop: t.spacing.md }}>
          <Callout tone="danger">{message}</Callout>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
