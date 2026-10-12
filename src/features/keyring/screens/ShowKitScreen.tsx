import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Fingerprint, WordGrid } from '@/components/mnemonic';
import { Badge, Button, Callout, Card, Medallion, Screen, Text } from '@/components/ui';
import { fetchRecoveryPubkey } from '@/features/auth/api';
import { withKey } from '@/features/lock/api';
import { useScreenCaptureBlock } from '@/features/lock/hooks';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

import { exportRecoveryKit, type RecoveryKitView } from '../admin-recovery';

type Shown = RecoveryKitView & { published: string | null; matches: boolean | null };

/**
 * Shows the Admin's 24 words again from the encrypted vault note, only while unlocked, with
 * screenshots blocked. The fingerprint is derived from the stored seed on the phone and compared
 * with the key the family published, so a match proves the paper copy will pass the self approval.
 */
export function ShowKitScreen() {
  const t = useTheme();
  const router = useRouter();
  useScreenCaptureBlock('f2h:show-kit');
  const isAdmin = useSession((s) => s.profile?.role === 'admin');
  const unlocked = useSession((s) => s.mk !== null);
  const [kit, setKit] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = async () => {
    setBusy(true);
    setError(null);
    try {
      const view = await withKey((mk) => exportRecoveryKit(mk));
      if (!view) {
        setError('No recovery key note was found in your vault on this account.');
        return;
      }
      const published = await fetchRecoveryPubkey().catch(() => null);
      setKit({
        ...view,
        published: published?.fingerprint ?? null,
        matches: published ? published.recovery_pub === view.publicKey : null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the recovery key note.');
    } finally {
      setBusy(false);
    }
  };

  const hide = () => {
    setKit(null);
    router.back();
  };

  if (!isAdmin) {
    return (
      <Screen title="Recovery kit">
        <Callout tone="danger">Only the Admin has a recovery kit.</Callout>
      </Screen>
    );
  }

  return (
    <Screen
      title="Your recovery kit"
      subtitle="The 24 words that prove you are the Admin on a new phone. Write them on paper, in order, and keep the paper at home."
      footer={
        kit ? (
          <Button onPress={hide} testID="show-kit-done">
            I wrote them down
          </Button>
        ) : (
          <>
            <Button
              onPress={() => void reveal()}
              loading={busy}
              disabled={busy || !unlocked}
              testID="show-kit-reveal"
            >
              Show the 24 words
            </Button>
            <Button variant="ghost" onPress={() => router.back()}>
              Back
            </Button>
          </>
        )
      }
    >
      {!kit ? (
        <Card style={{ gap: t.spacing.md, alignItems: 'center' }}>
          <Medallion icon="key" tone="primary" accessibilityLabel="Recovery kit, sealed" />
          <Badge tone="primary">Paper only</Badge>
          <Text variant="body" color="muted" align="center">
            Make sure nobody is looking at your screen. Screenshots are blocked here. Anyone holding
            these words and your password can open every family vault.
          </Text>
          {!unlocked ? <Callout tone="danger">Unlock the app with your PIN first.</Callout> : null}
          {error ? <Callout tone="danger">{error}</Callout> : null}
        </Card>
      ) : (
        <>
          <Card style={{ gap: t.spacing.sm }}>
            <Text variant="label" color="primary">
              Fingerprint
            </Text>
            <Fingerprint value={kit.fingerprint} testID="show-kit-fingerprint" />
            {kit.matches === true ? (
              <Badge tone="success">Matches the published family key</Badge>
            ) : kit.matches === false ? (
              <Callout tone="danger">
                {`These words do not match the published key (${kit.published ?? 'unknown'}). Do not rely on them; tell the developer before wiping anything.`}
              </Callout>
            ) : (
              <Callout>Offline: the published key could not be checked. Compare by eye.</Callout>
            )}
            <Text variant="caption" color="muted">
              Write the fingerprint under the words too.
            </Text>
          </Card>
          <Card style={{ gap: t.spacing.md }}>
            <WordGrid words={kit.words} testID="show-kit-words" />
          </Card>
        </>
      )}
    </Screen>
  );
}
