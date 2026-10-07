import { Link } from 'expo-router';
import { Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/** Boot screen. Routing to onboarding, auth and lock lands with those features. */
export default function BootScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.canvas,
        paddingTop: insets.top + t.spacing.huge,
        paddingHorizontal: t.sizes.sheetInset,
        gap: t.spacing.xxl,
        alignItems: 'center',
      }}
    >
      <Image
        source={require('../../assets/images/splash-icon.png')}
        accessibilityLabel="F2H bear mascot"
        style={{ width: t.sizes.hero, height: t.sizes.hero, borderRadius: t.radii.xl }}
      />
      <View style={{ alignItems: 'center', gap: t.spacing.xs }}>
        <Text variant="display" color="primary" accessibilityRole="header">
          F2H
        </Text>
        <Text variant="body" color="muted" align="center">
          Your family&apos;s private vault. Encrypted before it leaves your phone.
        </Text>
      </View>
      <Card style={{ alignSelf: 'stretch', gap: t.spacing.md }}>
        <Text variant="label" color="ink">
          Scaffold ready
        </Text>
        <Text variant="caption" color="muted">
          Onboarding, sign in and the vault screens arrive with their features.
        </Text>
        {__DEV__ ? (
          <Link href="/(dev)/gallery" asChild>
            <Button variant="secondary">Open component gallery</Button>
          </Link>
        ) : null}
      </Card>
    </View>
  );
}
