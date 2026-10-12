import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  Row,
  Screen,
  Sheet,
  Text,
  TextField,
} from '@/components/ui';
import {
  createInvite,
  createRecoveryGrant,
  listMemberDevices,
  listMembers,
  revokeMemberDevice,
  type AllowedRow,
  type MemberDevice,
  type MemberLabel,
  type MemberRow,
} from '@/features/admin/api';
import { loadRecoverySecretKey } from '@/features/keyring/admin-recovery';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

const LABELS: MemberLabel[] = ['father', 'mother', 'brother'];

/** Members (AC-5, AC-15): invite codes as text and QR, members with devices and recovery grants. */
export default function MembersScreen() {
  const t = useTheme();
  const router = useRouter();
  const mk = useSession((s) => s.mk);
  const myDeviceId = useSession((s) => s.deviceId);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<MemberRow[]>([]);
  const [allowed, setAllowed] = useState<AllowedRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [label, setLabel] = useState<MemberLabel>('father');
  const [issued, setIssued] = useState<{ email: string; code: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [member, setMember] = useState<MemberRow | null>(null);
  const [devices, setDevices] = useState<MemberDevice[] | null>(null);
  const [grantState, setGrantState] = useState<{
    deviceId: string;
    status: 'busy' | 'done' | 'error';
    message?: string;
  } | null>(null);

  const refresh = useCallback(() => {
    listMembers()
      .then((data) => {
        setProfiles(data.profiles);
        setAllowed(data.allowed);
        setLoadError(null);
      })
      .catch((e: unknown) =>
        setLoadError(e instanceof Error ? e.message : 'Could not load members'),
      );
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const invite = async () => {
    setBusy(true);
    setInviteError(null);
    try {
      const code = await createInvite(email, label);
      setIssued({ email: email.trim().toLowerCase(), code });
      setEmail('');
      void refresh();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Could not create the invite');
    } finally {
      setBusy(false);
    }
  };

  const openMember = async (m: MemberRow) => {
    setMember(m);
    setDevices(null);
    setGrantState(null);
    try {
      setDevices(await listMemberDevices(m.id));
    } catch {
      setDevices([]);
    }
  };

  const grant = async (device: MemberDevice) => {
    if (!member || !device.id || !mk) return;
    setGrantState({ deviceId: device.id, status: 'busy' });
    try {
      const secret = await loadRecoverySecretKey(mk);
      if (!secret) throw new Error('Recovery key not loaded on this phone');
      try {
        await createRecoveryGrant(
          secret,
          { user_id: member.id },
          { id: device.id, pubkey: device.pubkey },
        );
      } finally {
        secret.fill(0);
      }
      setGrantState({ deviceId: device.id, status: 'done' });
    } catch (e) {
      setGrantState({
        deviceId: device.id,
        status: 'error',
        message:
          e instanceof Error && e.message === 'tampered'
            ? 'Their key material does not verify.'
            : (e as Error).message,
      });
    }
  };

  // Oversight (spec 0005, AC-1): the member is told before anything is decrypted.
  const openVault = () => {
    if (!member) return;
    const who = member.display_name;
    Alert.alert(
      `Open ${who}'s vault?`,
      `${who} gets a notification and an entry in their Activity log saying you opened it. You see it read only.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open, logged',
          onPress: () => {
            setMember(null);
            router.push({
              pathname: '/(admin)/oversight/[userId]',
              params: { userId: member.id, name: who },
            });
          },
        },
      ],
    );
  };

  // Sign out a member's phone (spec 0005, AC-6).
  const signOutDevice = (d: MemberDevice) => {
    if (!member || !d.id) return;
    const id = d.id;
    Alert.alert(
      'Sign out this phone?',
      `${d.name || d.model || 'This phone'} wipes its vault keys the next time it opens F2H.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            setRevoking(id);
            setRevokeError(null);
            revokeMemberDevice(id)
              .then(() => listMemberDevices(member.id).then(setDevices))
              .catch((e: unknown) =>
                setRevokeError(e instanceof Error ? e.message : 'Could not sign it out'),
              )
              .finally(() => setRevoking(null));
          },
        },
      ],
    );
  };

  const pendingInvites = allowed.filter((a) => a.label !== 'admin' && !a.consumed_at);

  return (
    <Screen
      title="Members"
      subtitle="Four people, no strangers. Invites are one time codes you hand over in person."
    >
      {loadError ? <Callout tone="danger">{loadError}</Callout> : null}

      <Card style={{ gap: t.spacing.md }}>
        <Text variant="heading">Invite someone</Text>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          testID="invite-email"
        />
        <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
          {LABELS.map((l) => (
            <Button
              key={l}
              size="sm"
              fullWidth={false}
              variant={label === l ? 'primary' : 'secondary'}
              onPress={() => setLabel(l)}
              accessibilityState={{ selected: label === l }}
            >
              {l[0]?.toUpperCase() + l.slice(1)}
            </Button>
          ))}
        </View>
        {inviteError ? <Callout tone="danger">{inviteError}</Callout> : null}
        <Button
          loading={busy}
          disabled={!email.includes('@')}
          onPress={() => void invite()}
          testID="invite-create"
        >
          Create invite code
        </Button>
      </Card>

      {issued ? (
        <Card elevation="floating" style={{ alignItems: 'center', gap: t.spacing.md }}>
          <Badge tone="success">Valid for 7 days, one use</Badge>
          <Text variant="caption" color="muted">
            {issued.email}
          </Text>
          <Text
            variant="display"
            color="primary"
            selectable
            testID="invite-code"
            style={{ letterSpacing: 4 }}
          >
            {issued.code}
          </Text>
          <View
            style={{
              padding: t.spacing.md,
              backgroundColor: t.colors.surface,
              borderRadius: t.radii.lg,
            }}
          >
            <QRCode
              value={`f2h-invite:${issued.email}:${issued.code}`}
              size={t.sizes.hero * 1.4}
              color={t.colors.ink}
              backgroundColor={t.colors.surface}
            />
          </View>
          <Text variant="caption" color="muted" align="center">
            Show this in person. It is never sent by email or message.
          </Text>
          <Button variant="ghost" fullWidth={false} onPress={() => setIssued(null)}>
            Hide code
          </Button>
        </Card>
      ) : null}

      {pendingInvites.length > 0 ? (
        <Card style={{ gap: t.spacing.sm }}>
          <Text variant="heading">Open invites</Text>
          {pendingInvites.map((a) => (
            <Row
              key={a.email}
              dashed
              label={a.email}
              value={
                a.invite_expires_at
                  ? `until ${new Date(a.invite_expires_at).toLocaleDateString()}`
                  : 'no code yet'
              }
            />
          ))}
        </Card>
      ) : null}

      <Card style={{ gap: t.spacing.sm }}>
        <Text variant="heading">Family</Text>
        {profiles.length === 0 ? (
          <Text variant="body" color="muted">
            Nobody yet. Create an invite above.
          </Text>
        ) : null}
        {profiles.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${p.display_name}`}
            onPress={() => void openMember(p)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              minHeight: t.sizes.touch,
            }}
          >
            <Avatar name={p.display_name} />
            <View style={{ flex: 1 }}>
              <Text variant="label" color="ink">
                {p.display_name}
              </Text>
              <Text variant="caption" color="muted">
                {p.email}
              </Text>
            </View>
            <Badge
              tone={
                p.status === 'active' ? 'success' : p.status === 'pending' ? 'warning' : 'danger'
              }
            >
              {p.role === 'admin' ? 'Admin' : p.status}
            </Badge>
          </Pressable>
        ))}
      </Card>

      <Sheet
        open={member !== null}
        onClose={() => setMember(null)}
        title={member?.display_name ?? 'Member'}
      >
        {member && member.role !== 'admin' ? (
          <Button variant="secondary" onPress={openVault} testID="member-open-vault">
            Open vault (logged)
          </Button>
        ) : null}
        <Callout>
          Lost password? Pick the phone they still have. A one hour recovery grant lets that phone
          set a new password without an email.
        </Callout>
        {revokeError ? <Callout tone="danger">{revokeError}</Callout> : null}
        {devices === null ? (
          <Text variant="body" color="muted">
            Loading devices…
          </Text>
        ) : null}
        {devices?.length === 0 ? (
          <Text variant="body" color="muted">
            No devices yet.
          </Text>
        ) : null}
        {devices?.map((d) => {
          const state = grantState?.deviceId === d.id ? grantState : null;
          return (
            <Card key={d.id ?? ''} elevation="flat" style={{ gap: t.spacing.sm }}>
              <Row label={d.name || d.model || 'Phone'} value={d.status ?? ''} />
              {d.status === 'approved' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={state?.status === 'busy'}
                  disabled={state?.status === 'done'}
                  onPress={() => void grant(d)}
                >
                  {state?.status === 'done' ? 'Grant created' : 'Create recovery grant'}
                </Button>
              ) : null}
              {d.status === 'approved' && d.id !== myDeviceId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={revoking === d.id}
                  disabled={revoking !== null}
                  onPress={() => signOutDevice(d)}
                  testID={`member-signout-${d.id}`}
                >
                  Sign out this phone
                </Button>
              ) : null}
              {state?.status === 'error' ? (
                <Callout tone="danger">{state.message ?? 'Failed'}</Callout>
              ) : null}
            </Card>
          );
        })}
      </Sheet>
    </Screen>
  );
}
