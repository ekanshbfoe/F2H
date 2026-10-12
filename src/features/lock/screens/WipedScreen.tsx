import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';

import { useRiseIn } from '@/components/motion';
import { Button, Callout, Card, Medallion, Screen, Text } from '@/components/ui';
import { pathFor } from '@/features/auth/routes';
import { useTheme } from '@/theme';

import { describeWipe } from '../model';

/** After a wipe (AC-5, AC-6, AC-10): the reason's copy, then back to login. Keys are already gone. */
export function WipedScreen() {
  const t = useTheme();
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const copy = describeWipe(reason);
  // content rises in after the medallion, one beat apart (a rare screen, so it may take its time)
  const riseIn = useRiseIn();
  const beat = (n: number) => riseIn(t.motion.timingEnter.duration / 2 + n * t.motion.enterStepMs);
  return (
    <Screen
      title={copy.title}
      subtitle={copy.body}
      footer={
        <Button onPress={() => router.replace(pathFor('login'))} testID="wiped-login">
          Back to login
        </Button>
      }
    >
      <Card style={{ alignItems: 'center', gap: t.spacing.lg, paddingVertical: t.spacing.xxl }}>
        <Medallion icon="lock-closed" tone="danger" accessibilityLabel="Keys removed" />
        <Animated.View entering={beat(1)}>
          <Text variant="body" color="muted" align="center">
            Your vault itself is safe in the cloud, encrypted. Only this phone&apos;s keys were
            removed.
          </Text>
        </Animated.View>
      </Card>
      <Animated.View entering={beat(2)}>
        <Callout>
          {reason === 'revoked'
            ? 'If this was a mistake, log in and ask the Admin to approve this phone again.'
            : 'The Admin sees a note about this phone in the audit log.'}
        </Callout>
      </Animated.View>
    </Screen>
  );
}
