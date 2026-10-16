import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Badge, Button, Callout, Card, Row, Screen, Text } from '@/components/ui';
import { formatPhone, sortContacts } from '@/features/contacts/model';
import { SecretRow, ValueRow } from '@/features/credentials/components';
import { hostOf, toSections } from '@/features/credentials/model';
import { formatSize, sortFiles } from '@/features/files/model';
import { useScreenCaptureBlock } from '@/features/lock/hooks';
import { useLock } from '@/features/lock/lock.store';
import { copySecret } from '@/services/clipboard';
import { useTheme } from '@/theme';

import { openMemberVault, OversightError, type MemberVault } from '../oversight';

type Tab = 'contacts' | 'credentials' | 'files';
const TABS: { key: Tab; label: string }[] = [
  { key: 'contacts', label: 'Contacts' },
  { key: 'credentials', label: 'Credentials' },
  { key: 'files', label: 'Files' },
];

/**
 * Read only view of one member's vault (spec 0005, AC-3, AC-4). Opening it already wrote the
 * audit row and told the member. The decrypted vault lives in this screen's state only and is
 * dropped on leaving and on lock.
 */
export function OversightScreen() {
  const t = useTheme();
  const router = useRouter();
  useScreenCaptureBlock('f2h:oversight');
  const { userId, name } = useLocalSearchParams<{ userId: string; name?: string }>();
  const [vault, setVault] = useState<MemberVault | 'loading' | { error: string }>('loading');
  const [tab, setTab] = useState<Tab>('contacts');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!userId) return undefined;
    openMemberVault(userId)
      .then((v) => alive && setVault(v))
      .catch((e: unknown) => {
        if (!alive) return;
        const code = e instanceof OversightError ? e.code : 'failed';
        setVault({
          error:
            code === 'tampered'
              ? 'Key material tampered: this vault was not sealed to the family recovery key. Nothing was decrypted.'
              : code === 'no_recovery_key'
                ? 'This phone has no recovery key note. Open the vault from the phone that ran the first setup, or restore the note.'
                : code === 'denied'
                  ? 'Only the Admin on an approved phone can do this.'
                  : 'Could not open the vault. Check your connection and try again.',
        });
      });
    // a lock drops the decrypted vault at once
    const unsubscribe = useLock.subscribe((s, prev) => {
      if (s.generation !== prev.generation) {
        setVault('loading');
        router.back();
      }
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [userId, router]);

  const data = typeof vault === 'object' && 'contacts' in vault ? vault : null;
  const contacts = useMemo(() => (data ? sortContacts(data.contacts) : []), [data]);
  const sections = useMemo(() => (data ? toSections(data.credentials) : []), [data]);
  const files = useMemo(() => (data ? sortFiles(data.files) : []), [data]);

  const copy = (label: string, value: string) => {
    void copySecret(value).then(() => setCopied(label));
  };

  return (
    <Screen
      title={name ? `${name}'s vault` : 'Member vault'}
      subtitle="Read only. The member was told you opened it, and it is in their Activity log."
      footer={
        <Button variant="secondary" onPress={() => router.back()} testID="oversight-close">
          Close
        </Button>
      }
    >
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        <Badge tone="warning">Logged</Badge>
        <Badge tone="neutral">Read only</Badge>
      </View>

      {vault === 'loading' ? (
        <View style={{ paddingVertical: t.spacing.huge, alignItems: 'center', gap: t.spacing.md }}>
          <ActivityIndicator color={t.colors.primary} accessibilityLabel="Opening the vault" />
          <Text variant="caption" color="muted">
            Unsealing with the recovery key…
          </Text>
        </View>
      ) : 'error' in vault ? (
        <Callout tone="danger">{vault.error}</Callout>
      ) : (
        <>
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: t.spacing.sm }}>
            {TABS.map((x) => {
              const selected = x.key === tab;
              const count =
                x.key === 'contacts'
                  ? vault.contacts.length
                  : x.key === 'credentials'
                    ? vault.credentials.length
                    : vault.files.length;
              return (
                <Pressable
                  key={x.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setTab(x.key)}
                  testID={`oversight-tab-${x.key}`}
                  style={{
                    flex: 1,
                    minHeight: t.sizes.touch,
                    borderRadius: t.radii.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? t.colors.primary : t.colors.surface,
                    borderWidth: t.sizes.hairline,
                    borderColor: selected ? t.colors.primary : t.colors.line,
                  }}
                >
                  <Text variant="caption" color={selected ? 'onPrimary' : 'ink'}>
                    {`${x.label} · ${count}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {vault.skipped > 0 ? (
            <Callout>{`${vault.skipped} item${vault.skipped === 1 ? '' : 's'} could not be opened.`}</Callout>
          ) : null}

          {tab === 'contacts' ? (
            contacts.length === 0 ? (
              <Text variant="body" color="muted">
                No contacts.
              </Text>
            ) : (
              contacts.map((c) => (
                <Card key={c.id} style={{ gap: t.spacing.xs }}>
                  <Text variant="label">{c.payload.name}</Text>
                  {c.payload.phones.map((p, i) => (
                    <Row key={`${i}-${p.number}`} label={p.label} value={formatPhone(p.number)} />
                  ))}
                </Card>
              ))
            )
          ) : null}

          {tab === 'credentials' ? (
            sections.length === 0 ? (
              <Text variant="body" color="muted">
                No credentials.
              </Text>
            ) : (
              sections.map((s) => (
                <View key={s.category} style={{ gap: t.spacing.sm }}>
                  <Text variant="label" color="primary">
                    {s.title}
                  </Text>
                  {s.data.map((c) => (
                    <Card key={c.id} style={{ gap: t.spacing.sm }}>
                      <Text variant="label">{c.payload.title}</Text>
                      {c.payload.url ? (
                        <Text variant="caption" color="muted">
                          {hostOf(c.payload.url)}
                        </Text>
                      ) : null}
                      {c.payload.username ? (
                        <ValueRow
                          label="Username"
                          value={c.payload.username}
                          onCopy={() => copy('Username', c.payload.username ?? '')}
                          testID={`oversight-username-${c.id}`}
                        />
                      ) : null}
                      {c.payload.password ? (
                        <SecretRow
                          label="Password"
                          value={c.payload.password}
                          epoch={0}
                          onCopy={() => copy('Password', c.payload.password ?? '')}
                          testID={`oversight-password-${c.id}`}
                        />
                      ) : null}
                      {c.payload.fields.map((f, i) =>
                        f.secret ? (
                          <SecretRow
                            key={`${i}-${f.label}`}
                            label={f.label}
                            value={f.value}
                            epoch={0}
                            onCopy={() => copy(f.label, f.value)}
                            testID={`oversight-field-${c.id}-${i}`}
                          />
                        ) : (
                          <ValueRow
                            key={`${i}-${f.label}`}
                            label={f.label}
                            value={f.value}
                            onCopy={() => copy(f.label, f.value)}
                            testID={`oversight-field-${c.id}-${i}`}
                          />
                        ),
                      )}
                    </Card>
                  ))}
                </View>
              ))
            )
          ) : null}

          {tab === 'files' ? (
            files.length === 0 ? (
              <Text variant="body" color="muted">
                No files.
              </Text>
            ) : (
              files.map((f) => (
                <Card key={f.id} style={{ gap: t.spacing.xxs }}>
                  <Text variant="label">{f.payload.name}</Text>
                  <Text variant="caption" color="muted">
                    {`${formatSize(f.payload.size)} · ${new Date(f.payload.added_at).toLocaleDateString()}`}
                  </Text>
                </Card>
              ))
            )
          ) : null}

          {copied ? (
            <Callout tone="success">{`${copied} copied. Clears in 30 seconds.`}</Callout>
          ) : null}
        </>
      )}
    </Screen>
  );
}
