import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, Callout, Card, Screen, Text } from '@/components/ui';
import { pathFor } from '@/features/auth/routes';
import { useTheme } from '@/theme';

/** Rejected or expired (AC-13). Local key material is already wiped by the time this shows. */
export default function DeniedScreen() {
  const t = useTheme();
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const expired = reason === 'expired';
  return (
    <Screen
      title={expired ? 'Request expired' : 'Request rejected'}
      subtitle={
        expired
          ? 'The Admin did not approve this phone within a day, so the request closed on its own.'
          : 'The Admin did not approve this phone. Nothing from the vault was stored here.'
      }
      footer={<Button onPress={() => router.replace(pathFor('login'))}>Back to login</Button>}
    >
      <Card style={{ alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.xxl }}>
        <View
          style={{
            width: t.sizes.hero * 0.6,
            height: t.sizes.hero * 0.6,
            borderRadius: t.radii.pill,
            backgroundColor: expired ? t.colors.skyTint : t.colors.dangerTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={expired ? 'time-outline' : 'close-circle-outline'}
            size={t.sizes.avatar}
            color={expired ? t.colors.primary : t.colors.danger}
            accessibilityElementsHidden
          />
        </View>
        <Text variant="heading" align="center">
          {expired ? 'You can ask again' : 'Talk to the Admin'}
        </Text>
        <Text variant="body" color="muted" align="center">
          {expired
            ? 'Log in again to send a fresh request. The Admin gets a new notification.'
            : 'If this was a mistake, log in again and the Admin can approve the new request.'}
        </Text>
      </Card>
      <Callout>All local key material and the device token were removed from this phone.</Callout>
    </Screen>
  );
}
