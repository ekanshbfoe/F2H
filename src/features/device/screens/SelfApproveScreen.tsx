import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Switch, View } from 'react-native';

import { MNEMONIC_WORDS, MnemonicEntry } from '@/components/mnemonic';
import { Badge, Button, Callout, Card, Screen, Text } from '@/components/ui';
import { fromBase64, mnemonic, recovery } from '@/crypto';
import { fetchRecoveryPubkey } from '@/features/auth/api';
import { pathFor } from '@/features/auth/routes';
import { useScreenCaptureBlock } from '@/features/lock/hooks';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

import { checkRecoveryWords, countMyApprovedDevices, selfApprove } from '../self-approve';

const EMPTY = (): string[] => Array.from({ length: MNEMONIC_WORDS }, () => '');

type Published = { recovery_pub: string; fingerprint: string } | null | 'loading';

/**
 * The words step of the Admin self approval (AC-2, AC-3, AC-4, AC-5): 24 boxes, local checks,
 * then one burst against `self-approve-device`. On success the success step follows; on the
 * third wrong tag the row is rejected and the waiting screen's watcher wipes the phone.
 */
export function SelfApproveScreen() {
  const t = useTheme();
  const router = useRouter();
  useScreenCaptureBlock();
  const [words, setWords] = useState<string[]>(EMPTY);
  const [published, setPublished] = useState<Published>('loading');
  const [others, setOthers] = useState<number | null>(null);
  const [revokeOthers, setRevokeOthers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true);

  const fetchPublished = useCallback(() => {
    fetchRecoveryPubkey()
      .then((p) => alive.current && setPublished(p))
      .catch(() => alive.current && setPublished(null));
    countMyApprovedDevices()
      .then((n) => alive.current && setOthers(n))
      .catch(() => undefined);
  }, []);
  const retry = () => {
    setPublished('loading');
    fetchPublished();
  };

  // The word state lives in this screen only; every exit path below resets it (AC-3).
  useEffect(() => {
    alive.current = true;
    fetchPublished();
    return () => {
      alive.current = false;
    };
  }, [fetchPublished]);

  const fingerprint =
    published && published !== 'loading'
      ? recovery.fingerprint(fromBase64(published.recovery_pub))
      : null;

  const prove = async () => {
    if (!published || published === 'loading') return;
    setMessage(null);
    const check = checkRecoveryWords(words, published.recovery_pub);
    if (!check.ok) {
      setMessage(
        check.reason === 'count'
          ? 'Fill all 24 boxes first.'
          : check.reason === 'checksum'
            ? 'These words do not form a valid kit. Check each word against your paper copy; one letter off is enough.'
            : 'These words are a valid phrase, but not the kit this family published. Check the fingerprint on your paper copy.',
      );
      return;
    }
    const s = useSession.getState();
    setBusy(true);
    s.setSelfApproving(true);
    try {
      const outcome = await selfApprove(words, revokeOthers);
      switch (outcome.kind) {
        case 'approved':
          setWords(EMPTY());
          router.replace(pathFor('recovered'));
          return;
        case 'wrong':
          setMessage(
            outcome.attemptsLeft > 0
              ? `The kit did not prove this phone. ${outcome.attemptsLeft} ${outcome.attemptsLeft === 1 ? 'try' : 'tries'} left before this request is refused.`
              : 'The kit did not prove this phone. This request is refused.',
          );
          s.setSelfApproving(false);
          return;
        case 'rejected':
        case 'not_pending':
          setWords(EMPTY());
          s.setSelfApproving(false);
          router.replace(pathFor('waiting'));
          return;
        case 'too_many_challenges':
          setMessage(
            'Too many attempts on this request. Cancel it from the waiting screen and log in again.',
          );
          s.setSelfApproving(false);
          return;
        case 'network':
          setMessage(
            `Could not reach the vault (${outcome.message}). Your words are still here; try again.`,
          );
          s.setSelfApproving(false);
          return;
      }
    } catch (e) {
      s.setSelfApproving(false);
      setMessage(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Screen
      title="Prove your recovery kit"
      subtitle="Type the 24 words from your paper kit. They are checked on this phone first; nothing from the kit is sent anywhere."
      footer={
        <>
          <Button
            onPress={() => void prove()}
            loading={busy}
            disabled={busy || !published || published === 'loading'}
            testID="kit-prove"
          >
            Prove my kit
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onPress={() => {
              setWords(EMPTY());
              router.back();
            }}
          >
            Back
          </Button>
        </>
      }
    >
      <Card style={{ gap: t.spacing.sm }}>
        {published === 'loading' ? (
          <Text variant="body" color="muted">
            Fetching the published key fingerprint…
          </Text>
        ) : published ? (
          <>
            <Text variant="label" color="primary">
              Family fingerprint
            </Text>
            <Text variant="heading" color="ink" testID="kit-fingerprint">
              {fingerprint ?? ''}
            </Text>
            <Text variant="caption" color="muted">
              The same four groups are printed under the words on your paper kit.
            </Text>
          </>
        ) : (
          <>
            <Callout tone="danger">
              Could not fetch the published key. Check your connection and retry.
            </Callout>
            <Button variant="secondary" size="sm" onPress={retry}>
              Retry
            </Button>
          </>
        )}
      </Card>

      <Card style={{ gap: t.spacing.md }}>
        <MnemonicEntry
          value={words}
          onChange={setWords}
          suggest={mnemonic.suggest}
          isWord={mnemonic.isWord}
          disabled={busy}
          testID="kit"
        />
      </Card>

      {others !== null && others > 0 ? (
        <Card style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <View style={{ flex: 1, gap: t.spacing.xxs }}>
              <Text variant="label" color="ink">
                Also sign out my other phones
              </Text>
              <Text variant="caption" color="muted">
                {`${others} other ${others === 1 ? 'phone is' : 'phones are'} signed in as Admin. Turn this on if one of them is lost; it happens in the same step as the approval.`}
              </Text>
            </View>
            <Switch
              value={revokeOthers}
              onValueChange={setRevokeOthers}
              disabled={busy}
              accessibilityLabel="Also sign out my other phones"
              trackColor={{ true: t.colors.primary, false: t.colors.lineStrong }}
              testID="kit-revoke-others"
            />
          </View>
        </Card>
      ) : null}

      {message ? <Callout tone="danger">{message}</Callout> : null}
      <View style={{ alignItems: 'center' }}>
        <Badge tone="primary">Three wrong proofs refuse this request</Badge>
      </View>
    </Screen>
  );
}
