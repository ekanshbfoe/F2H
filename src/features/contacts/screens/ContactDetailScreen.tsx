import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { Avatar, Badge, Button, Callout, Card, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { ContactsError } from '../api';
import { formatPhone, telUrl, whatsappUrl } from '../model';
import { contactEditHref } from '../routes';
import { useContacts } from '../store';

/** One contact (spec 0003, AC-3, AC-6): call, open in WhatsApp, edit, delete. */
export function ContactDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const contact = useContacts((s) => (id ? s.items[id] : undefined));
  const status = useContacts((s) => s.status);
  const offline = useContacts((s) => s.offline);
  const load = useContacts((s) => s.load);
  const remove = useContacts((s) => s.remove);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  const open = (url: string) => {
    Linking.openURL(url).catch(() => setMessage('This phone could not open that link.'));
  };

  const confirmDelete = () => {
    if (!contact) return;
    Alert.alert(
      'Delete this contact?',
      `${contact.payload.name} leaves your vault on every phone.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            remove(contact)
              .then(() => router.back())
              .catch((e: unknown) => {
                setBusy(false);
                setMessage(
                  e instanceof ContactsError && e.code === 'stale_version'
                    ? 'Another phone changed this contact. Pull to refresh the list, then try again.'
                    : 'Could not delete the contact. Check your connection.',
                );
              });
          },
        },
      ],
    );
  };

  if (!contact) {
    return (
      <Screen title="Contact">
        {status === 'ready' ? (
          <Callout tone="danger">This contact is no longer in your vault.</Callout>
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

  const p = contact.payload;
  return (
    <Screen
      footer={
        <>
          <Button
            variant="secondary"
            onPress={() => router.push(contactEditHref(contact.id))}
            disabled={busy || offline}
            testID="contact-edit"
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            onPress={confirmDelete}
            loading={busy}
            disabled={offline}
            testID="contact-delete"
          >
            Delete
          </Button>
        </>
      }
    >
      <View style={{ alignItems: 'center', gap: t.spacing.sm }}>
        <Avatar name={p.name} size="lg" />
        <Text variant="title" accessibilityRole="header" align="center">
          {p.name}
        </Text>
        <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          {p.channels.call ? <Badge tone="primary">Call</Badge> : null}
          {p.channels.whatsapp ? <Badge tone="success">WhatsApp</Badge> : null}
        </View>
      </View>

      {p.phones.map((phone, i) => {
        const wa = whatsappUrl(phone.number);
        return (
          <Card
            key={`${i}-${phone.number}`}
            style={{ gap: t.spacing.sm }}
            testID={`contact-phone-${i}`}
          >
            <Text variant="caption" color="muted">
              {phone.label}
            </Text>
            <Text variant="heading" color="ink" selectable>
              {formatPhone(phone.number)}
            </Text>
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  size="sm"
                  onPress={() => open(telUrl(phone.number))}
                  accessibilityLabel={`Call ${p.name} on ${phone.label}`}
                  testID={`contact-call-${i}`}
                  leading={<Ionicons name="call" size={t.sizes.icon} color={t.colors.onPrimary} />}
                >
                  Call
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!wa}
                  onPress={() => wa && open(wa)}
                  accessibilityLabel={`Open ${p.name} in WhatsApp`}
                  testID={`contact-whatsapp-${i}`}
                  leading={
                    <Ionicons name="logo-whatsapp" size={t.sizes.icon} color={t.colors.primary} />
                  }
                >
                  WhatsApp
                </Button>
              </View>
            </View>
            {!wa ? (
              <Text variant="caption" color="muted">
                WhatsApp needs the country code. Edit the number to start with + and the code.
              </Text>
            ) : null}
          </Card>
        );
      })}

      {p.note ? (
        <Card style={{ gap: t.spacing.xs }}>
          <Text variant="label" color="primary">
            Note
          </Text>
          <Text variant="body" selectable>
            {p.note}
          </Text>
        </Card>
      ) : null}
      {message ? <Callout tone="danger">{message}</Callout> : null}
      <Text variant="caption" color="muted" align="center">
        {p.source === 'device'
          ? 'Imported from this phone · encrypted in your vault'
          : 'Encrypted in your vault'}
      </Text>
    </Screen>
  );
}
