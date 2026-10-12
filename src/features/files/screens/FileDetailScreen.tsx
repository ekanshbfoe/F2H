import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Badge, Button, Callout, Card, Row, Screen, Text } from '@/components/ui';
import { useScreenCaptureBlock } from '@/features/lock/hooks';
import { useTheme } from '@/theme';

import { downloadFile, FilesError } from '../api';
import { formatSize } from '../model';
import { useFiles } from '../store';

/** One file (child spec 0001-drive-redundancy, AC-9, AC-11): open after a hash check, delete. */
export function FileDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  useScreenCaptureBlock('f2h:file');
  const { id } = useLocalSearchParams<{ id: string }>();
  const file = useFiles((s) => (id ? s.items[id] : undefined));
  const state = useFiles((s) => (id ? s.states[id] : undefined));
  const status = useFiles((s) => s.status);
  const load = useFiles((s) => s.load);
  const remove = useFiles((s) => s.remove);
  const [busy, setBusy] = useState<'open' | 'delete' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  if (!file) {
    return (
      <Screen title="File">
        {status === 'ready' ? (
          <Callout tone="danger">This file is no longer in your vault.</Callout>
        ) : (
          <Text variant="body" color="muted">
            Opening…
          </Text>
        )}
        <Button variant="ghost" onPress={() => router.back()}>
          Back
        </Button>
      </Screen>
    );
  }

  const p = file.payload;

  const open = async () => {
    setBusy('open');
    setMessage(null);
    try {
      const uri = await downloadFile(file);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: p.mime, dialogTitle: p.name });
      } else {
        setMessage(
          'This phone cannot open files from apps. The decrypted copy is cleared when the vault locks.',
        );
      }
    } catch (e) {
      const code = e instanceof FilesError ? e.code : null;
      setMessage(
        code === 'hash_mismatch'
          ? 'The copy on Drive does not match what was saved. It was not opened. The nightly check will repair it from the other Drive.'
          : code === 'no_healthy_copy'
            ? 'Neither Drive has a good copy right now. Tell the Admin.'
            : 'Could not download the file. Check your connection and try again.',
      );
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete this file?',
      `${p.name} goes to the trash on both Drives and leaves your vault.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setBusy('delete');
            remove(file)
              .then(() => router.back())
              .catch(() => {
                setBusy(null);
                setMessage('Could not delete it. Check your connection.');
              });
          },
        },
      ],
    );
  };

  return (
    <Screen
      title={p.name}
      footer={
        <>
          <Button
            onPress={() => void open()}
            loading={busy === 'open'}
            disabled={busy !== null}
            testID="file-open"
          >
            Open
          </Button>
          <Button
            variant="ghost"
            onPress={confirmDelete}
            loading={busy === 'delete'}
            disabled={busy !== null}
            testID="file-delete"
          >
            Delete
          </Button>
        </>
      }
    >
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        {state === 'ok' ? <Badge tone="success">On both Drives</Badge> : null}
        {state === 'degraded' ? <Badge tone="warning">On one Drive</Badge> : null}
        {state === 'missing' ? <Badge tone="danger">Missing</Badge> : null}
        <Badge tone="neutral">Encrypted</Badge>
      </View>
      <Card style={{ gap: t.spacing.sm }}>
        <Row label="Size" value={formatSize(p.size)} />
        <Row label="Type" value={p.mime} />
        <Row label="Added" value={new Date(p.added_at).toLocaleString()} />
      </Card>
      <Text variant="caption" color="muted">
        Opening downloads the encrypted copy, checks it against the hash saved with it, and decrypts
        it on this phone. The decrypted copy is deleted when the vault locks.
      </Text>
      {message ? <Callout tone="danger">{message}</Callout> : null}
    </Screen>
  );
}
