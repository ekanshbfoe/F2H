import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { Badge, Button, Callout, Card, Screen, Text } from '@/components/ui';
import { useScreenCaptureBlock } from '@/features/lock/hooks';
import { VaultItemError } from '@/features/vault/items';
import { copySecret } from '@/services/clipboard';
import { useTheme } from '@/theme';

import { CATEGORY_LABEL, hostOf, MASK } from '../model';
import { credentialEditHref } from '../routes';
import { useCredentials } from '../store';

export const REVEAL_MS = 30_000;

/** One credential (spec 0004, AC-4, AC-5, AC-6): masked secrets, timed reveal, timed copy. */
export function CredentialDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  useScreenCaptureBlock('f2h:credential');
  const { id } = useLocalSearchParams<{ id: string }>();
  const credential = useCredentials((s) => (id ? s.items[id] : undefined));
  const status = useCredentials((s) => s.status);
  const load = useCredentials((s) => s.load);
  const remove = useCredentials((s) => s.remove);
  const [copied, setCopied] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped when the screen loses focus: every revealed field masks itself again.
  const [focusEpoch, setFocusEpoch] = useState(0);

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  useFocusEffect(useCallback(() => () => setFocusEpoch((n) => n + 1), []));

  const copy = (label: string, value: string) => {
    copySecret(value)
      .then(() => setCopied(label))
      .catch(() => setMessage('Could not reach the clipboard.'));
  };

  const confirmDelete = () => {
    if (!credential) return;
    Alert.alert(
      'Delete this credential?',
      `${credential.payload.title} leaves your vault on every phone.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            remove(credential)
              .then(() => router.back())
              .catch((e: unknown) => {
                setBusy(false);
                setMessage(
                  e instanceof VaultItemError && e.code === 'stale_version'
                    ? 'Another phone changed this credential. Go back, refresh, then try again.'
                    : 'Could not delete it. Check your connection.',
                );
              });
          },
        },
      ],
    );
  };

  if (!credential) {
    return (
      <Screen title="Credential">
        {status === 'ready' ? (
          <Callout tone="danger">This credential is no longer in your vault.</Callout>
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

  const p = credential.payload;
  const host = hostOf(p.url ?? '');
  return (
    <Screen
      title={p.title}
      footer={
        <>
          <Button
            variant="secondary"
            onPress={() => router.push(credentialEditHref(credential.id))}
            disabled={busy}
            testID="credential-edit"
          >
            Edit
          </Button>
          <Button variant="ghost" onPress={confirmDelete} loading={busy} testID="credential-delete">
            Delete
          </Button>
        </>
      }
    >
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        <Badge tone="primary">{CATEGORY_LABEL[p.category]}</Badge>
        <Badge tone="neutral">Encrypted</Badge>
      </View>

      <Card style={{ gap: t.spacing.md }}>
        {p.username ? (
          <ValueRow
            label="Username"
            value={p.username}
            onCopy={() => copy('Username', p.username ?? '')}
            testID="credential-username"
          />
        ) : null}
        {p.password ? (
          <SecretRow
            label="Password"
            value={p.password}
            epoch={focusEpoch}
            onCopy={() => copy('Password', p.password ?? '')}
            testID="credential-password"
          />
        ) : null}
        {p.url ? (
          <View style={{ gap: t.spacing.xs }}>
            <Text variant="caption" color="muted">
              Website
            </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open ${host}`}
              onPress={() => {
                Linking.openURL(p.url ?? '').catch(() =>
                  setMessage('This phone could not open that address.'),
                );
              }}
              testID="credential-url"
            >
              <Text variant="label" color="primary">
                {host || p.url}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Card>

      {p.fields.length > 0 ? (
        <Card style={{ gap: t.spacing.md }}>
          {p.fields.map((f, i) =>
            f.secret ? (
              <SecretRow
                key={`${i}-${f.label}`}
                label={f.label}
                value={f.value}
                epoch={focusEpoch}
                onCopy={() => copy(f.label, f.value)}
                testID={`credential-field-${i}`}
              />
            ) : (
              <ValueRow
                key={`${i}-${f.label}`}
                label={f.label}
                value={f.value}
                onCopy={() => copy(f.label, f.value)}
                testID={`credential-field-${i}`}
              />
            ),
          )}
        </Card>
      ) : null}

      {p.note ? (
        <Card style={{ gap: t.spacing.xs }}>
          <Text variant="label" color="primary">
            Note
          </Text>
          <Text variant="body">{p.note}</Text>
        </Card>
      ) : null}

      {copied ? (
        <Callout tone="success" accessibilityLiveRegion="polite" testID="credential-copied">
          {`${copied} copied. Clears in 30 seconds.`}
        </Callout>
      ) : null}
      {message ? <Callout tone="danger">{message}</Callout> : null}
    </Screen>
  );
}

function ValueRow({
  label,
  value,
  onCopy,
  testID,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  testID: string;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
      <View style={{ flex: 1, gap: t.spacing.xxs }}>
        <Text variant="caption" color="muted">
          {label}
        </Text>
        <Text variant="label" testID={`${testID}-value`}>
          {value}
        </Text>
      </View>
      <IconButton
        icon="copy-outline"
        label={`Copy ${label}`}
        onPress={onCopy}
        testID={`${testID}-copy`}
      />
    </View>
  );
}

/** A secret shown as 8 dots; Reveal shows it for 30 seconds or until the screen loses focus. */
function SecretRow({
  label,
  value,
  epoch,
  onCopy,
  testID,
}: {
  label: string;
  value: string;
  epoch: number;
  onCopy: () => void;
  testID: string;
}) {
  const t = useTheme();
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = revealedAt !== null && revealedAt >= epoch;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const toggle = () => {
    if (timer.current) clearTimeout(timer.current);
    if (shown) {
      setRevealedAt(null);
      return;
    }
    setRevealedAt(epoch);
    timer.current = setTimeout(() => setRevealedAt(null), REVEAL_MS);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
      <View style={{ flex: 1, gap: t.spacing.xxs }}>
        <Text variant="caption" color="muted">
          {label}
        </Text>
        <Text
          variant="label"
          testID={`${testID}-value`}
          accessibilityLabel={shown ? undefined : `${label} hidden`}
        >
          {shown ? value : MASK}
        </Text>
      </View>
      <IconButton
        icon={shown ? 'eye-off-outline' : 'eye-outline'}
        label={shown ? `Hide ${label}` : `Reveal ${label}`}
        onPress={toggle}
        testID={`${testID}-reveal`}
      />
      <IconButton
        icon="copy-outline"
        label={`Copy ${label}`}
        onPress={onCopy}
        testID={`${testID}-copy`}
      />
    </View>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => ({
        width: t.sizes.touch,
        height: t.sizes.touch,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: t.radii.pill,
        backgroundColor: pressed ? t.colors.primaryTint : t.colors.skyTint,
      })}
    >
      <Ionicons name={icon} size={t.sizes.icon} color={t.colors.primary} />
    </Pressable>
  );
}
