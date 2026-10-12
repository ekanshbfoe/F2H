import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { useRiseIn } from '@/components/motion';
import { Badge, Button, Callout, Card, Medallion, Row, Screen, Text } from '@/components/ui';
import { completeApproval } from '@/features/auth/api';
import { describeAuthError, pathFor } from '@/features/auth/routes';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

import { listOtherApprovedDevices, revokeOtherDevice, type OtherDevice } from '../self-approve';

function seen(iso: string): string {
  if (!iso) return 'unknown';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

/**
 * The success step after a self approval (AC-4, AC-6): this phone is approved, the other admin
 * phones are listed with a one tap sign out, then the normal key release continues to Set PIN
 * (or to login when the password session ended during the proof).
 */
export function RecoveredScreen() {
  const t = useTheme();
  const router = useRouter();
  const hasKek = useSession((s) => s.kek !== null);
  const [devices, setDevices] = useState<OtherDevice[] | 'loading' | 'error'>('loading');
  const [signedOut, setSignedOut] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const riseIn = useRiseIn();
  const glide = useMemo(
    () => LinearTransition.duration(t.motion.glideMs).easing(t.motion.easeInOut),
    [t.motion.glideMs, t.motion.easeInOut],
  );
  const beat = (n: number) => riseIn(t.motion.timingEnter.duration / 2 + n * t.motion.enterStepMs);

  const fetchDevices = useCallback(() => {
    listOtherApprovedDevices()
      .then(setDevices)
      .catch(() => setDevices('error'));
  }, []);
  const retry = () => {
    setDevices('loading');
    fetchDevices();
  };

  useEffect(fetchDevices, [fetchDevices]);

  const signOut = async (d: OtherDevice) => {
    setWorking(d.id);
    setMessage(null);
    try {
      await revokeOtherDevice(d.id);
      setSignedOut((s) => new Set(s).add(d.id));
    } catch (e) {
      setMessage(
        e instanceof Error
          ? `Could not sign out ${d.model}: ${e.message}`
          : 'Could not sign out that phone.',
      );
    } finally {
      setWorking(null);
    }
  };

  const proceed = () => {
    setLeaving(true);
    useSession.getState().setSelfApproving(false);
    completeApproval()
      .then((route) => router.replace(pathFor(route)))
      .catch((e) => {
        setLeaving(false);
        setMessage(describeAuthError(e));
      });
  };

  const list = Array.isArray(devices) ? devices : [];

  return (
    <Screen
      title="This phone is approved"
      subtitle="Your paper kit proved it. Before you set a PIN, decide what happens to your other phones."
      footer={
        <Button onPress={proceed} loading={leaving} disabled={leaving} testID="recovered-continue">
          {hasKek ? 'Continue to Set PIN' : 'Continue to login'}
        </Button>
      }
    >
      <Card style={{ gap: t.spacing.md, alignItems: 'center' }}>
        <Medallion icon="shield-checkmark" tone="success" accessibilityLabel="Approved" />
        <Badge tone="success">Approved with the recovery kit</Badge>
        <Text variant="body" color="muted" align="center">
          The vault wrote an audit entry for this approval, so every member can see when the Admin
          got back in. Your other admin phones were told as well.
        </Text>
      </Card>

      <Animated.View entering={beat(1)} layout={glide}>
        <Card style={{ gap: t.spacing.md }}>
          <Text variant="heading" color="ink">
            Other admin phones
          </Text>
          {devices === 'loading' ? (
            <Text variant="body" color="muted">
              Looking up your other phones…
            </Text>
          ) : devices === 'error' ? (
            <>
              <Callout tone="danger">Could not list your other phones.</Callout>
              <Button variant="secondary" size="sm" onPress={retry}>
                Retry
              </Button>
            </>
          ) : list.length === 0 ? (
            <Row dashed label="No other phone is signed in as Admin" />
          ) : (
            list.map((d) => {
              const done = signedOut.has(d.id);
              return (
                <Animated.View key={d.id} layout={glide} style={{ gap: t.spacing.xs }}>
                  <Row
                    dashed={done}
                    label={d.name || d.model}
                    value={`${d.model} · ${d.os} · seen ${seen(d.last_seen_at)}`}
                    trailing={
                      done ? (
                        <Animated.View
                          entering={FadeIn.duration(t.motion.transitionMs).easing(t.motion.easeOut)}
                        >
                          <Badge tone="neutral">Signed out</Badge>
                        </Animated.View>
                      ) : null
                    }
                  />
                  {!done ? (
                    <Animated.View
                      exiting={FadeOut.duration(t.motion.transitionMs).easing(t.motion.easeOut)}
                    >
                      <Button
                        variant="danger"
                        size="sm"
                        loading={working === d.id}
                        disabled={working !== null}
                        onPress={() => void signOut(d)}
                        testID={`recovered-signout-${d.id}`}
                      >
                        Sign out that phone
                      </Button>
                    </Animated.View>
                  ) : null}
                </Animated.View>
              );
            })
          )}
          <Animated.View layout={glide}>
            <Text variant="caption" color="muted">
              A signed out phone wipes its vault keys the next time it is opened.
            </Text>
          </Animated.View>
        </Card>
      </Animated.View>

      {!hasKek ? (
        <Callout>
          Your password session ended while you typed the words. This phone is approved; after this
          step, log in with your password once more and it opens straight into Set PIN.
        </Callout>
      ) : null}
      {message ? <Callout tone="danger">{message}</Callout> : null}
    </Screen>
  );
}
