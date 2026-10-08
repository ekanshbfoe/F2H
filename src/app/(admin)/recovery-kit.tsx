import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { CascadeList } from '@/components/motion';
import { Badge, Button, Callout, Card, Screen, Text, TextField } from '@/components/ui';
import { routeWithKey } from '@/features/auth/api';
import { pathFor } from '@/features/auth/routes';
import {
  finishRecoveryKit,
  pickConfirmPositions,
  startRecoveryKit,
  type RecoveryKitDraft,
} from '@/features/keyring/admin-recovery';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

type Step = 'intro' | 'words' | 'confirm' | 'saving' | 'done';

/** Admin first run (AC-4): 24 words shown once, 3 confirmed, key published, seed kept in the vault. */
export default function RecoveryKitScreen() {
  const t = useTheme();
  const router = useRouter();
  const profile = useSession((s) => s.profile);
  const kek = useSession((s) => s.kek);
  const [step, setStep] = useState<Step>('intro');
  const [draft, setDraft] = useState<RecoveryKitDraft | null>(null);
  const positions = useMemo(() => pickConfirmPositions(), []);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  const [error, setError] = useState<string | null>(null);

  const begin = () => {
    setDraft(startRecoveryKit());
    setStep('words');
  };

  const confirm = async () => {
    if (!draft || !profile || !kek) {
      setError('Session expired. Log in again to continue.');
      return;
    }
    const wrong = positions.filter(
      (p, i) => draft.words[p - 1] !== answers[i]?.trim().toLowerCase(),
    );
    if (wrong.length > 0) {
      setError(`Word ${wrong.join(', ')} does not match. Check your paper copy.`);
      return;
    }
    setError(null);
    setStep('saving');
    try {
      const mk = await finishRecoveryKit(draft, kek, profile.id);
      const s = useSession.getState();
      s.setMk(mk);
      s.setKek(null);
      s.setPhase('ready');
      draft.seed.fill(0);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish the recovery key.');
      setStep('confirm');
    }
  };

  return (
    <Screen
      title="Your recovery kit"
      subtitle="Once, before anyone else joins: write down 24 words. They open every family vault in an emergency and recover your own account."
      footer={
        step === 'intro' ? (
          <Button onPress={begin} testID="kit-begin">
            Show my 24 words
          </Button>
        ) : step === 'words' ? (
          <Button onPress={() => setStep('confirm')} testID="kit-written">
            I wrote them down
          </Button>
        ) : step === 'confirm' ? (
          <Button onPress={() => void confirm()} testID="kit-confirm">
            Confirm and finish
          </Button>
        ) : step === 'done' ? (
          <Button
            onPress={() =>
              (profile ? routeWithKey(profile) : Promise.resolve('home' as const)).then((r) =>
                router.replace(pathFor(r)),
              )
            }
            testID="kit-done"
          >
            Open my vault
          </Button>
        ) : (
          <Button loading onPress={() => undefined}>
            Publishing
          </Button>
        )
      }
    >
      {step === 'intro' ? (
        <>
          <Card style={{ gap: t.spacing.md }}>
            <Badge tone="primary">Paper only</Badge>
            <Text variant="body" color="muted">
              Nothing about these words is stored in the cloud. Keep the paper somewhere safe at
              home. Anyone holding it can open the family vaults, so treat it like the key to the
              house.
            </Text>
          </Card>
          <Callout>
            Your phone will show a fingerprint after this step. Members compare it with the one on
            their sign up screen, so nobody can swap your key.
          </Callout>
        </>
      ) : null}

      {step === 'words' && draft ? (
        <>
          <Card style={{ gap: t.spacing.md }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {draft.words.map((word, i) => (
                <View
                  key={`${i}-${word}`}
                  style={{
                    width: '47%',
                    flexDirection: 'row',
                    gap: t.spacing.sm,
                    alignItems: 'center',
                    paddingVertical: t.spacing.xs,
                    paddingHorizontal: t.spacing.sm,
                    borderRadius: t.radii.md,
                    backgroundColor: t.colors.skyTint,
                  }}
                  accessibilityLabel={`word ${i + 1}: ${word}`}
                >
                  <Text variant="caption" color="muted">
                    {String(i + 1).padStart(2, '0')}
                  </Text>
                  <Text variant="label" color="ink">
                    {word}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
          <Card style={{ gap: t.spacing.xs }}>
            <Text variant="label" color="primary">
              Fingerprint
            </Text>
            <Text variant="heading" color="ink" testID="kit-fingerprint">
              {draft.fingerprint}
            </Text>
            <Text variant="caption" color="muted">
              Write this under the words. Members will read it back to you when they sign up.
            </Text>
          </Card>
        </>
      ) : null}

      {step === 'confirm' || step === 'saving' ? (
        <Card style={{ gap: t.spacing.md }}>
          <Text variant="body" color="muted">
            Type three words from your paper copy to prove it is complete.
          </Text>
          <CascadeList gap="md">
            {positions.map((p, i) => (
              <TextField
                key={p}
                label={`Word ${p}`}
                value={answers[i] ?? ''}
                onChangeText={(v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))}
                autoCapitalize="none"
                autoCorrect={false}
                editable={step === 'confirm'}
                testID={`kit-word-${p}`}
              />
            ))}
          </CascadeList>
          {error ? <Callout tone="danger">{error}</Callout> : null}
        </Card>
      ) : null}

      {step === 'done' ? (
        <Card style={{ gap: t.spacing.md }}>
          <Badge tone="success">Recovery key published</Badge>
          <Text variant="body" color="muted">
            This phone is approved and your vault is open. Invite the family from Members; each of
            them sees your fingerprint when they sign up.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}
