import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, Callout, Card, Row, Screen, Text } from '@/components/ui';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

import { linkSlot, listDriveStatus, type DriveSlotStatus, type Slot } from '../drive';
import { formatSize } from '../model';

const SLOT_COPY: Record<Slot, { title: string; who: string }> = {
  a: { title: 'Drive A', who: "The Admin's Google account" },
  b: {
    title: 'Drive B',
    who: "The Father's Google account. He signs in on this phone, with you present.",
  },
};

/** Google Drives (child spec 0001-drive-redundancy, AC-1, AC-2): link and relink both slots. */
export function DriveScreen() {
  const t = useTheme();
  const isAdmin = useSession((s) => s.profile?.role === 'admin');
  const [slots, setSlots] = useState<DriveSlotStatus[] | 'loading' | 'error'>('loading');
  const [busy, setBusy] = useState<Slot | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const fetchSlots = useCallback(() => {
    listDriveStatus()
      .then(setSlots)
      .catch(() => setSlots('error'));
  }, []);

  useEffect(() => {
    if (isAdmin) fetchSlots();
  }, [isAdmin, fetchSlots]);

  if (!isAdmin) {
    return (
      <Screen title="Google Drives">
        <Callout tone="danger">Only the Admin links the family Drives.</Callout>
      </Screen>
    );
  }

  const link = async (slot: Slot) => {
    setBusy(slot);
    setMessage(null);
    try {
      const outcome = await linkSlot(slot);
      setMessage(
        outcome === 'linked'
          ? { tone: 'success', text: `${SLOT_COPY[slot].title} is linked.` }
          : outcome === 'cancelled'
            ? { tone: 'danger', text: 'Linking was cancelled.' }
            : { tone: 'danger', text: 'Google did not finish linking. Try again.' },
      );
    } catch {
      setMessage({ tone: 'danger', text: 'Could not start linking. Check your connection.' });
    } finally {
      setBusy(null);
      fetchSlots();
    }
  };

  const list = Array.isArray(slots) ? slots : [];

  return (
    <Screen
      title="Google Drives"
      subtitle="Every file is encrypted on the phone and kept on both Drives. F2H only sees the files it created there."
    >
      {slots === 'error' ? <Callout tone="danger">Could not read the Drive status.</Callout> : null}
      {(['a', 'b'] as const).map((slot) => {
        const s = list.find((x) => x.slot === slot);
        return (
          <Card key={slot} style={{ gap: t.spacing.md }} testID={`drive-slot-${slot}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
              <Text variant="heading" style={{ flex: 1 }}>
                {SLOT_COPY[slot].title}
              </Text>
              {s?.status === 'active' ? <Badge tone="success">Linked</Badge> : null}
              {s?.status === 'needs_relink' ? (
                <Badge tone="danger">Needs linking again</Badge>
              ) : null}
              {!s && slots !== 'loading' ? <Badge tone="warning">Not linked</Badge> : null}
            </View>
            <Text variant="caption" color="muted">
              {SLOT_COPY[slot].who}
            </Text>
            {s ? (
              <>
                <Row label="Account" value={s.google_email} />
                <Row label="Used by F2H" value={formatSize(s.bytes_used)} />
              </>
            ) : null}
            <Button
              variant={s?.status === 'active' ? 'secondary' : 'primary'}
              size="sm"
              loading={busy === slot}
              disabled={busy !== null}
              onPress={() => void link(slot)}
              testID={`drive-link-${slot}`}
            >
              {s ? 'Link again' : 'Link with Google'}
            </Button>
          </Card>
        );
      })}
      {message ? <Callout tone={message.tone}>{message.text}</Callout> : null}
      <Callout>
        Google asks for access to files F2H creates, nothing else. Before the first link, the Google
        Cloud consent screen must be published to Production, or Google drops the link after 7 days.
      </Callout>
    </Screen>
  );
}
