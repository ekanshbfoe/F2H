import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar, Badge, Button, Callout, Card, Screen, Text } from '@/components/ui';
import {
  listPendingDevices,
  subscribePendingDevices,
  type MemberDevice,
} from '@/features/admin/api';
import { whereOf } from '@/features/admin/approval/ApprovalSheet';
import { useApprovalPrompt } from '@/features/admin/approval/prompt';
import { useTheme } from '@/theme';

/** Approvals inbox (AC-9): the live pending list; a row opens the app wide approval sheet. */
export default function ApprovalsScreen() {
  const t = useTheme();
  const router = useRouter();
  const show = useApprovalPrompt((s) => s.show);
  const [items, setItems] = useState<MemberDevice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listPendingDevices()
      .then((rows) => {
        setItems(rows);
        setLoadError(null);
      })
      .catch((e: unknown) =>
        setLoadError(e instanceof Error ? e.message : 'Could not load requests'),
      );
  }, []);

  useEffect(() => {
    void refresh();
    return subscribePendingDevices(() => void refresh());
  }, [refresh]);

  return (
    <Screen
      title="Approvals"
      subtitle="Phones waiting to join. Approve only a request you expect; check the device and place with the member."
    >
      {loadError ? <Callout tone="danger">{loadError}</Callout> : null}
      {items === null ? <Callout>Loading requests…</Callout> : null}
      {items && items.length === 0 ? (
        <Card
          dashed
          style={{ alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.xxl }}
        >
          <Text variant="heading" align="center">
            Nothing waiting
          </Text>
          <Text variant="body" color="muted" align="center">
            New sign ins show up here the moment they happen, even while this screen is open.
          </Text>
          <Button variant="secondary" fullWidth={false} onPress={() => router.back()}>
            Back home
          </Button>
        </Card>
      ) : null}
      {items?.map((d) => (
        <Pressable
          key={d.id ?? ''}
          accessibilityRole="button"
          accessibilityLabel={`Review request from ${d.display_name ?? 'member'}`}
          onPress={() => show(d)}
          testID={`approval-${d.id}`}
        >
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <Avatar name={d.display_name ?? '?'} />
            <View style={{ flex: 1, gap: t.spacing.xxs }}>
              <Text variant="label" color="ink">
                {d.display_name ?? 'Member'}
              </Text>
              <Text variant="caption" color="muted">
                {`${d.model ?? 'Phone'} · ${whereOf(d)}`}
              </Text>
            </View>
            <Badge tone="warning">Pending</Badge>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
