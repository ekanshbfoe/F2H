import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Avatar, Button, Callout, Card, Choice, Screen, Text } from '@/components/ui';
import { formatPhone, sortContacts } from '@/features/contacts/model';
import { categoryIcon, SecretRow, ValueRow } from '@/features/credentials/components';
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
  { key: 'credentials', label: 'Passwords' },
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

  const count = (key: Tab) =>
    !data
      ? 0
      : key === 'contacts'
        ? data.contacts.length
        : key === 'credentials'
          ? data.credentials.length
          : data.files.length;

  return (
    <Screen
      title={name ? `${name}'s vault` : 'Member vault'}
      footer={
        <Button variant="secondary" onPress={() => router.back()} testID="oversight-close">
          Close
        </Button>
      }
    >
      {/* the one thing never to forget on this screen: it is someone else's, and they know */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          padding: t.spacing.md,
          borderRadius: t.radii.lg,
          backgroundColor: t.colors.skyTint,
        }}
        testID="oversight-banner"
      >
        <View
          style={{
            width: t.sizes.touch,
            height: t.sizes.touch,
            borderRadius: t.radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.colors.surface,
          }}
        >
          <Ionicons name="eye-outline" size={t.sizes.iconLg} color={t.colors.sky} />
        </View>
        <View style={{ flex: 1, gap: t.spacing.xxs }}>
          <Text variant="label" color="ink">
            Read only
          </Text>
          <Text variant="caption" color="muted">
            {`${name ?? 'The member'} was told you opened this, and it is in their Activity log.`}
          </Text>
        </View>
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
          <Choice
            options={TABS.map((x) => ({
              value: x.key,
              label: `${x.label} ${count(x.key)}`,
              accessibilityLabel: `${x.label}, ${count(x.key)}`,
            }))}
            value={tab}
            onChange={setTab}
            accessibilityLabel="Show"
            testID="oversight-tabs"
          />
          {vault.skipped > 0 ? (
            <Callout>{`${vault.skipped} item${vault.skipped === 1 ? '' : 's'} could not be opened.`}</Callout>
          ) : null}

          {tab === 'contacts' ? (
            contacts.length === 0 ? (
              <Empty icon="people-outline" text="No contacts." />
            ) : (
              <Card style={{ paddingVertical: t.spacing.xs }}>
                {contacts.map((c, i) => (
                  <View
                    key={c.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.spacing.md,
                      paddingVertical: t.spacing.sm,
                      borderTopWidth: i === 0 ? 0 : t.sizes.hairline,
                      borderTopColor: t.colors.line,
                    }}
                  >
                    <Avatar name={c.payload.name} />
                    <View style={{ flex: 1, gap: t.spacing.xxs }}>
                      <Text variant="label" color="ink" numberOfLines={1}>
                        {c.payload.name}
                      </Text>
                      {c.payload.phones.map((p, j) => (
                        <Pressable
                          key={`${j}-${p.number}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Copy ${p.label} number`}
                          onPress={() => copy('Number', p.number)}
                          hitSlop={t.spacing.xs}
                        >
                          <Text variant="caption" color="muted">
                            {`${formatPhone(p.number)} · ${p.label}`}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </Card>
            )
          ) : null}

          {tab === 'credentials' ? (
            sections.length === 0 ? (
              <Empty icon="key-outline" text="No passwords." />
            ) : (
              sections.map((s) => (
                <View key={s.category} style={{ gap: t.spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
                    <Ionicons
                      name={categoryIcon(s.category)}
                      size={t.sizes.icon}
                      color={t.colors.primary}
                    />
                    <Text variant="label" color="primary" accessibilityRole="header">
                      {s.title}
                    </Text>
                  </View>
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
              <Empty icon="documents-outline" text="No files." />
            ) : (
              <>
                <Card style={{ paddingVertical: t.spacing.xs }}>
                  {files.map((f, i) => (
                    <View
                      key={f.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.spacing.md,
                        paddingVertical: t.spacing.sm,
                        borderTopWidth: i === 0 ? 0 : t.sizes.hairline,
                        borderTopColor: t.colors.line,
                      }}
                    >
                      <Ionicons
                        name={
                          f.payload.mime.startsWith('image/')
                            ? 'image-outline'
                            : f.payload.mime === 'application/pdf'
                              ? 'document-text-outline'
                              : 'document-outline'
                        }
                        size={t.sizes.iconLg}
                        color={t.colors.primary}
                      />
                      <View style={{ flex: 1, gap: t.spacing.xxs }}>
                        <Text variant="label" color="ink" numberOfLines={1}>
                          {f.payload.name}
                        </Text>
                        <Text variant="caption" color="muted">
                          {`${formatSize(f.payload.size)} · ${new Date(f.payload.added_at).toLocaleDateString()}`}
                        </Text>
                      </View>
                    </View>
                  ))}
                </Card>
                <Text variant="caption" color="muted" align="center">
                  Files are listed here only; they open on the member&apos;s own phone.
                </Text>
              </>
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

function Empty({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const t = useTheme();
  return (
    <Card
      dashed
      style={{ alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.xxl }}
    >
      <Ionicons name={icon} size={t.sizes.hero / 3} color={t.colors.sky} />
      <Text variant="body" color="muted" align="center">
        {text}
      </Text>
    </Card>
  );
}
