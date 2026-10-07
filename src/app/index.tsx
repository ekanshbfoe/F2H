import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Callout, Card, Text } from '@/components/ui';
import { resolveBootRoute } from '@/features/auth/api';
import { pathFor } from '@/features/auth/routes';
import { useTheme } from '@/theme';

/** Boot: decides the first screen from the session, the device status and what is in memory. */
export default function BootScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    resolveBootRoute()
      .then((route) => {
        if (active) router.replace(pathFor(route));
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Could not start');
      });
    return () => {
      active = false;
    };
  }, [router, attempt]);

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
      {error ? (
        <Card style={{ alignSelf: 'stretch', gap: t.spacing.md }}>
          <Callout tone="danger">{`Could not start: ${error}`}</Callout>
          <Button variant="secondary" onPress={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </Card>
      ) : (
        <ActivityIndicator color={t.colors.primary} accessibilityLabel="Starting" />
      )}
      {__DEV__ ? (
        <Link href="/(dev)/gallery" asChild>
          <Button variant="ghost" fullWidth={false}>
            Component gallery
          </Button>
        </Link>
      ) : null}
    </View>
  );
}
