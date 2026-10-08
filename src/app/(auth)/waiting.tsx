import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Badge, Button, Callout, Card, Row, Screen, Text } from '@/components/ui';
import {
  cancelMyRequest,
  completeApproval,
  fetchRecoveryPubkey,
  wipeLocalState,
} from '@/features/auth/api';
import { describeAuthError, pathFor } from '@/features/auth/routes';
import { countMyApprovedDevices } from '@/features/device/approved-count';
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
  const selfApproving = useSession((s) => s.selfApproving);
  const { device, error: watchError } = useApprovalWatch(deviceId);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);
  const finishing = device?.status === 'approved' && error === null && !selfApproving;
  const isAdmin = profile?.role === 'admin';
  // The recovery kit card (self approval spec, AC-1): only for the Admin, only once the key is published.
  const [kit, setKit] = useState<'loading' | 'ready' | 'offline' | 'none'>(
    isAdmin ? 'loading' : 'none',
  );
  const [approvedCount, setApprovedCount] = useState<number | null>(null);

  const fetchKit = useCallback(() => {
    fetchRecoveryPubkey()
      .then((p) => setKit(p ? 'ready' : 'none'))
      .catch(() => setKit('offline'));
  }, []);
  const retryKit = () => {
    setKit('loading');
    fetchKit();
  };

  useEffect(() => {
    if (isAdmin) fetchKit();
  }, [isAdmin, fetchKit]);

  // Main action or secondary link: refreshed on every Realtime event and poll tick (the row object changes).
  useEffect(() => {
    if (!isAdmin || device?.status !== 'pending') return;
    countMyApprovedDevices()
      .then((n) => setApprovedCount(n))
      .catch(() => undefined);
  }, [isAdmin, device]);

  useEffect(() => {
    if (!device || handled.current) return;
    if (device.status === 'approved') {
      // The words screen owns this transition while a self approval is running (AC-4).
      if (selfApproving) return;
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
  }, [device, router, selfApproving]);

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
      {isAdmin && kit !== 'none' && device?.status === 'pending' ? (
        <Card style={{ gap: t.spacing.md }} testID="kit-card">
          <Badge tone="primary">You are the Admin</Badge>
          <Text variant="heading" color="ink">
            {approvedCount !== null && approvedCount > 0
              ? "Can't reach your other phone?"
              : 'Use my recovery kit'}
          </Text>
          <Text variant="body" color="muted">
            {approvedCount !== null && approvedCount > 0
              ? `${approvedCount} other ${approvedCount === 1 ? 'phone is' : 'phones are'} signed in as Admin and can approve this one. If none is at hand, the 24 words of your paper kit prove it instead.`
              : 'No other Admin phone can approve this one. The 24 words of your paper kit prove it is you; nothing from the kit leaves this phone.'}
          </Text>
          {kit === 'offline' ? (
            <>
              <Callout tone="danger">
                The published key could not be fetched. Check your connection.
              </Callout>
              <Button variant="secondary" size="sm" onPress={retryKit}>
                Retry
              </Button>
            </>
          ) : (
            <Button
              variant={approvedCount !== null && approvedCount > 0 ? 'secondary' : 'primary'}
              loading={kit === 'loading'}
              disabled={kit !== 'ready'}
              onPress={() => router.push(pathFor('recovery-words'))}
              testID="kit-open"
            >
              {approvedCount !== null && approvedCount > 0
                ? 'Use the recovery kit instead'
                : 'Enter my 24 words'}
            </Button>
          )}
        </Card>
      ) : null}
      <Callout>
        {isAdmin
          ? 'Another approved Admin phone can approve this one with one tap. Keep this screen open or come back later; this phone stays on the list for 24 hours.'
          : 'Ask the Admin to open F2H. They see this request live and can approve it with one tap. Keep this screen open or come back later; this phone stays on the list for 24 hours.'}
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
