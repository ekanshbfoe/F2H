import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, Callout, Card, Screen, Text } from '@/components/ui';
import { pathFor } from '@/features/auth/routes';
import { useTheme } from '@/theme';

import { describeWipe } from '../model';

/** After a wipe (AC-5, AC-6, AC-10): the reason's copy, then back to login. Keys are already gone. */
export function WipedScreen() {
  const t = useTheme();
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const copy = describeWipe(reason);
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
      <Card style={{ alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.xxl }}>
        <View
          style={{
            width: t.sizes.hero * 0.6,
            height: t.sizes.hero * 0.6,
            borderRadius: t.radii.pill,
            backgroundColor: t.colors.dangerTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="lock-closed-outline" size={t.sizes.hero * 0.3} color={t.colors.danger} />
        </View>
        <Text variant="body" color="muted" align="center">
          Your vault itself is safe in the cloud, encrypted. Only this phone&apos;s keys were
          removed.
        </Text>
      </Card>
      <Callout>
        {reason === 'revoked'
          ? 'If this was a mistake, log in and ask the Admin to approve this phone again.'
          : 'The Admin sees a note about this phone in the audit log.'}
      </Callout>
    </Screen>
  );
}
