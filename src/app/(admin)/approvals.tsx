import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { MorphButton, type MorphState } from '@/components/motion';
import { Avatar, Badge, Button, Callout, Card, Row, Screen, Sheet, Text } from '@/components/ui';
import {
  decideDevice,
  fetchApprovalMaterial,
  listPendingDevices,
  subscribePendingDevices,
  verifyMemberWrap,
  type MemberDevice,
} from '@/features/admin/api';
import { loadRecoverySecretKey } from '@/features/keyring/admin-recovery';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

type Check = 'checking' | 'verified' | 'tampered' | 'no_key';

function whereOf(d: MemberDevice): string {
  const geo = d.last_geo as { city?: string | null; country_code?: string | null } | null;
  return [geo?.city, geo?.country_code].filter(Boolean).join(', ') || 'Unknown location';
}

/** Approvals inbox (AC-9, AC-10, AC-11): live pending list, verified wrap, morphing approve sheet. */
export default function ApprovalsScreen() {
  const t = useTheme();
  const router = useRouter();
  const mk = useSession((s) => s.mk);
  const [items, setItems] = useState<MemberDevice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MemberDevice | null>(null);
  const [check, setCheck] = useState<Check>('checking');
  const [morph, setMorph] = useState<MorphState>('idle');
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [actionError, setActionError] = useState<string | null>(null);

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

  const open = async (device: MemberDevice) => {
    setSelected(device);
    setMorph('idle');
    setActionError(null);
    setCheck('checking');
    if (!mk || !device.user_id) {
      setCheck('no_key');
      return;
    }
    try {
      const secret = await loadRecoverySecretKey(mk);
      if (!secret) {
        setCheck('no_key');
        return;
      }
      const material = await fetchApprovalMaterial(device.user_id);
      const memberMk = material ? verifyMemberWrap(secret, material) : null;
      secret.fill(0);
      if (memberMk) {
        memberMk.fill(0);
        setCheck('verified');
      } else {
        setCheck('tampered');
      }
    } catch {
      setCheck('tampered');
    }
  };

  const decide = async (next: 'approve' | 'reject') => {
    if (!selected?.id) return;
    setDecision(next);
    setMorph('pending');
    setActionError(null);
    try {
      await decideDevice(selected.id, next);
      setMorph('success');
      void refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The decision did not go through.');
      setMorph('error');
    }
  };

  const close = () => {
    setSelected(null);
    setMorph('idle');
  };

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
          onPress={() => void open(d)}
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

      <Sheet open={selected !== null} onClose={close} title="Approve this phone?">
        {selected ? (
          <MorphButton
            state={morph}
            label="Approve"
            tone={decision === 'reject' ? 'danger' : 'primary'}
            onPress={() => void decide('approve')}
            pendingTitle={decision === 'approve' ? 'Approving' : 'Rejecting'}
            pendingSubtitle="Updating the family vault"
            success={
              <View style={{ alignItems: 'center', gap: t.spacing.md }}>
                <Text variant="heading" align="center">
                  {decision === 'approve' ? 'All set' : 'Request rejected'}
                </Text>
                <Text variant="body" color="muted" align="center">
                  {decision === 'approve'
                    ? `${selected.display_name ?? 'The member'} can open their vault on ${selected.model ?? 'that phone'} now.`
                    : 'That phone was told and holds nothing from the vault.'}
                </Text>
                <Button fullWidth={false} onPress={close}>
                  Done
                </Button>
              </View>
            }
            error={
              <View style={{ alignItems: 'center', gap: t.spacing.md }}>
                <Text variant="heading" align="center">
                  Did not go through
                </Text>
                <Text variant="body" color="muted" align="center">
                  {actionError ?? 'Try again in a moment.'}
                </Text>
                <Button fullWidth={false} variant="secondary" onPress={() => setMorph('idle')}>
                  Back
                </Button>
              </View>
            }
            testID="approve-morph"
          >
            <Callout>
              {`${selected.display_name ?? 'A member'} wants to use F2H on a new phone. Confirm the details with them before approving.`}
            </Callout>
            <Row
              dashed
              label="Device"
              value={`${selected.model ?? 'Phone'} · ${selected.os ?? ''}`}
            />
            <Row dashed label="Location" value={whereOf(selected)} />
            <Row
              dashed
              label="Requested"
              value={selected.requested_at ? new Date(selected.requested_at).toLocaleString() : ''}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
              <Badge
                tone={
                  check === 'verified' ? 'success' : check === 'checking' ? 'neutral' : 'danger'
                }
              >
                {check === 'checking'
                  ? 'Checking key material'
                  : check === 'verified'
                    ? 'Key material verified'
                    : check === 'no_key'
                      ? 'Recovery key unavailable'
                      : 'Key material tampered'}
              </Badge>
            </View>
            {check === 'tampered' ? (
              <Callout tone="danger">
                The member&apos;s sealed key does not verify. Someone may have replaced it. Do not
                approve; ask the member to sign up again.
              </Callout>
            ) : null}
            {check === 'no_key' ? (
              <Callout tone="danger">
                Your recovery key is not loaded on this phone. Unlock your vault first.
              </Callout>
            ) : null}
            {morph === 'idle' ? (
              <Button variant="ghost" onPress={() => void decide('reject')} testID="reject-button">
                Reject
              </Button>
            ) : null}
          </MorphButton>
        ) : null}
      </Sheet>
    </Screen>
  );
}
