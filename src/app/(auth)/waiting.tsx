import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Badge, Button, Callout, Card, Row, Screen, Text } from '@/components/ui';
import { cancelMyRequest, completeApproval, wipeLocalState } from '@/features/auth/api';
import { describeAuthError, pathFor } from '@/features/auth/routes';
import { useApprovalWatch } from '@/features/device/useApprovalWatch';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

function since(iso: string | null | undefined): string {
  if (!iso) return 'just now';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

/** Waiting for the Admin (AC-7): live over Realtime, polled every 10 s as the fallback. */
export default function WaitingScreen() {
  const t = useTheme();
  const router = useRouter();
  const deviceId = useSession((s) => s.deviceId);
  const profile = useSession((s) => s.profile);
  const { device, error: watchError } = useApprovalWatch(deviceId);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);
  const finishing = device?.status === 'approved' && error === null;

  useEffect(() => {
    if (!device || handled.current) return;
    if (device.status === 'approved') {
      handled.current = true;
      completeApproval()
        .then((route) => router.replace(pathFor(route)))
        .catch((e) => {
          handled.current = false;
          setError(describeAuthError(e));
        });
    } else if (
      device.status === 'rejected' ||
      device.status === 'expired' ||
      device.status === 'revoked'
    ) {
      handled.current = true;
      const phase = device.status === 'expired' ? 'expired' : 'rejected';
      wipeLocalState(phase).finally(() => router.replace(pathFor(phase)));
    }
  }, [device, router]);

  const geo = device?.last_geo as { city?: string | null; country_code?: string | null } | null;
  const where = [geo?.city, geo?.country_code].filter(Boolean).join(', ') || 'Unknown';

  return (
    <Screen
      title="Waiting for the Admin"
      subtitle={`Hi ${profile?.display_name ?? 'there'}. The Admin has to approve this phone before your vault opens.`}
      footer={
        <Button
          variant="ghost"
          disabled={finishing}
          onPress={() =>
            cancelMyRequest()
              .catch(() => undefined)
              .then(() => wipeLocalState('signed_out'))
              .finally(() => router.replace(pathFor('login')))
          }
        >
          Cancel this request
        </Button>
      }
    >
      <Card style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <ActivityIndicator color={t.colors.primary} />
          <Badge tone={finishing ? 'success' : 'warning'}>
            {finishing ? 'Approved, opening' : 'Pending approval'}
          </Badge>
        </View>
        <Row dashed label="Device" value={device ? `${device.model} · ${device.os}` : '…'} />
        <Row dashed label="Location" value={device ? where : '…'} />
        <Row dashed label="IP" value={device?.last_ip ? String(device.last_ip) : '…'} />
        <Row dashed label="Requested" value={since(device?.requested_at)} />
      </Card>
      <Callout>
        Ask the Admin to open F2H. They see this request live and can approve it with one tap. Keep
        this screen open or come back later; this phone stays on the list for 24 hours.
      </Callout>
      {watchError ? (
        <Callout tone="danger">{`Live updates paused: ${watchError}. Still checking every 10 seconds.`}</Callout>
      ) : null}
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <Text variant="caption" color="muted" align="center">
        Nothing from your vault is readable on this phone until the Admin approves it.
      </Text>
    </Screen>
  );
}
