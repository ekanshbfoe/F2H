import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Badge, Button, Callout, Card, Screen, Text } from '@/components/ui';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

import { ACTIVITY_LIMIT, listActivity } from '../api';
import { deviceLine, isOversightOfViewer, labelFor, whoLine, type AuditRow } from '../model';

/** Activity (spec 0005, AC-5): what happened to this account, and for the Admin, to the family. */
export function ActivityScreen() {
  const t = useTheme();
  const profile = useSession((s) => s.profile);
  const [data, setData] = useState<
    { rows: AuditRow[]; names: Record<string, string> } | 'loading' | 'error'
  >('loading');

  const fetchRows = useCallback(() => {
    listActivity()
      .then(setData)
      .catch(() => setData('error'));
  }, []);

  useFocusEffect(fetchRows);

  const viewer = { id: profile?.id ?? '', isAdmin: profile?.role === 'admin' };

  return (
    <Screen
      title="Activity"
      subtitle={
        viewer.isAdmin
          ? `The newest ${ACTIVITY_LIMIT} events for the whole family. Nobody can edit this log.`
          : `The newest ${ACTIVITY_LIMIT} events about your account, including every time the Admin opened your vault.`
      }
    >
      {data === 'loading' ? (
        <View style={{ paddingVertical: t.spacing.huge, alignItems: 'center' }}>
          <ActivityIndicator color={t.colors.primary} accessibilityLabel="Loading activity" />
        </View>
      ) : data === 'error' ? (
        <Card style={{ gap: t.spacing.sm }}>
          <Callout tone="danger">Could not load the activity log.</Callout>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              setData('loading');
              fetchRows();
            }}
          >
            Retry
          </Button>
        </Card>
      ) : data.rows.length === 0 ? (
        <Card dashed testID="activity-empty">
          <Text variant="body" color="muted" align="center">
            Nothing yet.
          </Text>
        </Card>
      ) : (
        data.rows.map((row) => {
          const oversight = isOversightOfViewer(row, viewer.id);
          const device = deviceLine(row);
          return (
            <Card key={row.id} style={{ gap: t.spacing.xs }} testID={`activity-${row.id}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                <Text variant="label" style={{ flex: 1 }}>
                  {labelFor(row.action)}
                </Text>
                {oversight ? <Badge tone="warning">About you</Badge> : null}
              </View>
              <Text variant="caption" color="muted">
                {[
                  whoLine(row, viewer, data.names),
                  device,
                  new Date(row.created_at).toLocaleString(),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
