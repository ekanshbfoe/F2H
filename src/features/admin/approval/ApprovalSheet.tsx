import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { CardFan, MorphButton, type MorphState } from '@/components/motion';
import { Badge, Button, Callout, Row, Sheet, Text } from '@/components/ui';
import { loadRecoverySecretKey } from '@/features/keyring/admin-recovery';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

import { decideDevice, fetchApprovalMaterial, verifyMemberWrap, type MemberDevice } from '../api';
import { useApprovalPrompt } from './prompt';

type Check = 'checking' | 'verified' | 'tampered' | 'no_key';

export function whereOf(d: MemberDevice): string {
  const geo = d.last_geo as { city?: string | null; country_code?: string | null } | null;
  return [geo?.city, geo?.country_code].filter(Boolean).join(', ') || 'Unknown location';
}

/**
 * The approval sheet (AC-9, AC-10, AC-11), shown over any screen for the request in
 * `useApprovalPrompt`. It verifies the member's sealed key before Approve can be pressed, then
 * morphs the button into the working panel and wipes to the result.
 */
export function ApprovalSheet() {
  const device = useApprovalPrompt((s) => s.device);
  const close = useApprovalPrompt((s) => s.close);
  // keep the last request on screen while the sheet slides away
  const [shown, setShown] = useState(device);
  if (device && device !== shown) setShown(device);
  return (
    <Sheet
      open={device !== null}
      onClose={close}
      title="Approve this phone?"
      testID="approval-sheet"
    >
      {shown ? <ApprovalBody key={shown.id ?? ''} device={shown} onDone={close} /> : null}
    </Sheet>
  );
}

function ApprovalBody({ device, onDone }: { device: MemberDevice; onDone: () => void }) {
  const t = useTheme();
  const mk = useSession((s) => s.mk);
  const [check, setCheck] = useState<Check>('checking');
  const [morph, setMorph] = useState<MorphState>('idle');
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [actionError, setActionError] = useState<string | null>(null);
  const userId = device.user_id;

  useEffect(() => {
    let live = true;
    const run = async (): Promise<Check> => {
      if (!mk || !userId) return 'no_key';
      const secret = await loadRecoverySecretKey(mk);
      if (!secret) return 'no_key';
      try {
        const material = await fetchApprovalMaterial(userId);
        const memberMk = material ? verifyMemberWrap(secret, material) : null;
        if (!memberMk) return 'tampered';
        memberMk.fill(0);
        return 'verified';
      } finally {
        secret.fill(0);
      }
    };
    run()
      .catch((): Check => 'tampered')
      .then((result) => {
        if (live) setCheck(result);
      });
    return () => {
      live = false;
    };
  }, [mk, userId]);

  const decide = async (next: 'approve' | 'reject') => {
    if (!device.id) return;
    if (next === 'approve' && check !== 'verified') return; // AC-10: never approve an unverified wrap
    setDecision(next);
    setMorph('pending');
    setActionError(null);
    try {
      await decideDevice(device.id, next);
      setMorph('success');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'The decision did not go through.');
      setMorph('error');
    }
  };

  const who = device.display_name ?? 'A member';
  const phone = device.model ?? 'Phone';

  return (
    <MorphButton
      state={morph}
      label={
        check === 'verified'
          ? 'Approve'
          : check === 'checking'
            ? 'Checking key material'
            : 'Approve unavailable'
      }
      disabled={check !== 'verified'}
      tone={decision === 'reject' ? 'danger' : 'primary'}
      onPress={() => void decide('approve')}
      pendingTitle={decision === 'approve' ? 'Approving' : 'Rejecting'}
      pendingSubtitle="Updating the family vault"
      success={
        decision === 'approve' ? (
          <View style={{ alignSelf: 'stretch', alignItems: 'center', gap: t.spacing.lg }}>
            <View style={{ alignItems: 'center', gap: t.spacing.xs }}>
              <Text variant="title" color="primary" align="center">
                All set
              </Text>
              <Text variant="body" color="muted" align="center">
                {`${who} can open their vault on this phone now.`}
              </Text>
            </View>
            <CardFan testID="approve-card">
              <View style={{ gap: t.spacing.xs }}>
                <Text variant="heading" color="onPrimary" numberOfLines={1}>
                  {who}
                </Text>
                <Text variant="body" color="onPrimary" numberOfLines={1}>
                  {phone}
                </Text>
                <Text variant="caption" color="onPrimary" numberOfLines={1}>
                  {whereOf(device)}
                </Text>
              </View>
            </CardFan>
            <View style={{ alignSelf: 'stretch' }}>
              <Button onPress={onDone} testID="approve-done">
                Done
              </Button>
            </View>
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: t.spacing.md }}>
            <Text variant="heading" align="center">
              Request rejected
            </Text>
            <Text variant="body" color="muted" align="center">
              That phone was told and holds nothing from the vault.
            </Text>
            <Button fullWidth={false} onPress={onDone}>
              Done
            </Button>
          </View>
        )
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
        {`${who} wants to use F2H on a new phone. Confirm the details with them before approving.`}
      </Callout>
      <Row dashed label="Device" value={`${phone} · ${device.os ?? ''}`} />
      <Row dashed label="Location" value={whereOf(device)} />
      <Row
        dashed
        label="Requested"
        value={device.requested_at ? new Date(device.requested_at).toLocaleString() : ''}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
        <Badge
          tone={check === 'verified' ? 'success' : check === 'checking' ? 'neutral' : 'danger'}
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
  );
}
