import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Badge, Button, Callout, Card, Screen, Text } from '@/components/ui';
import { formatSize } from '@/features/files/model';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

import { backUpNow, listBackups, type BackupRow } from '../api';

function describe(code: string | undefined): string {
  switch (code) {
    case 'no_drive_linked':
      return 'No Google Drive is linked yet. Link Drive A and B first.';
    case 'recovery_not_published':
      return 'The recovery kit is not set up, so there is no key to seal backups to.';
    default:
      return 'The backup did not run. Check your connection and try again.';
  }
}

/** Backups (spec 0006, AC-5): the last 30 days of sealed snapshots and a manual run. */
export function BackupsScreen() {
  const t = useTheme();
  const isAdmin = useSession((s) => s.profile?.role === 'admin');
  const [rows, setRows] = useState<BackupRow[] | 'loading' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const fetchRows = useCallback(() => {
    if (!isAdmin) return;
    listBackups()
      .then(setRows)
      .catch(() => setRows('error'));
  }, [isAdmin]);

  useFocusEffect(fetchRows);

  if (!isAdmin) {
    return (
      <Screen title="Backups">
        <Callout tone="danger">Only the Admin manages backups.</Callout>
      </Screen>
    );
  }

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await backUpNow();
      setMessage(
        r.state === 'ok'
          ? { tone: 'success', text: `Backup saved on both Drives (${formatSize(r.size)}).` }
          : r.state === 'degraded'
            ? {
                tone: 'danger',
                text: 'Backup saved on one Drive only. Check the Google Drives screen.',
              }
            : { tone: 'danger', text: 'The backup reached no Drive.' },
      );
    } catch (e) {
      setMessage({ tone: 'danger', text: describe((e as { code?: string }).code) });
    } finally {
      setBusy(false);
      fetchRows();
    }
  };

  return (
    <Screen
      title="Backups"
      subtitle="Every night the whole database is sealed to your paper recovery kit and saved on both Drives. Only the 24 words open it."
      footer={
        <Button onPress={() => void run()} loading={busy} testID="backups-run">
          Back up now
        </Button>
      }
    >
      {message ? <Callout tone={message.tone}>{message.text}</Callout> : null}
      {rows === 'loading' ? (
        <View style={{ paddingVertical: t.spacing.huge, alignItems: 'center' }}>
          <ActivityIndicator color={t.colors.primary} accessibilityLabel="Loading backups" />
        </View>
      ) : rows === 'error' ? (
        <Callout tone="danger">Could not load the backup list.</Callout>
      ) : rows.length === 0 ? (
        <Card dashed testID="backups-empty">
          <Text variant="body" color="muted" align="center">
            No backup yet. The first one runs tonight at 03:00 UTC, or tap Back up now once a Drive
            is linked.
          </Text>
        </Card>
      ) : (
        rows.map((r) => (
          <Card key={r.id} style={{ gap: t.spacing.xs }} testID={`backup-${r.id}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
              <Text variant="label" style={{ flex: 1 }}>
                {new Date(r.taken_at).toLocaleString()}
              </Text>
              <Badge
                tone={r.state === 'ok' ? 'success' : r.state === 'degraded' ? 'warning' : 'danger'}
              >
                {r.state === 'ok' ? 'Both Drives' : r.state === 'degraded' ? 'One Drive' : 'Failed'}
              </Badge>
            </View>
            <Text variant="caption" color="muted">
              {`${formatSize(Number(r.size))} · Drive A ${r.drive_a_file_id ? 'yes' : 'no'} · Drive B ${r.drive_b_file_id ? 'yes' : 'no'}`}
            </Text>
          </Card>
        ))
      )}
      <Callout>
        To restore, follow docs/runbooks/restore.md on a computer with the paper kit. The phone
        never needs the 24 words for a backup.
      </Callout>
    </Screen>
  );
}
