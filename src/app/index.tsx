import { Link, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Callout, Card, Text } from '@/components/ui';
import { resolveAfterUnlock, resolveBootRoute } from '@/features/auth/api';
import { pathFor } from '@/features/auth/routes';
import { useLock } from '@/features/lock/lock.store';
import { useTheme } from '@/theme';

/**
 * Boot: decides the first screen from the session, the device status and what is in memory.
 * It is drawn exactly like the native splash (same blue, same logo, same size, centred), so the
 * hand off from the splash is invisible and opening the app reads as one step. It also shows
 * again for a moment after the PIN gate fades, while the session is checked.
 */
export default function BootScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), t.motion.bootSpinnerDelayMs);
    return () => clearTimeout(timer);
  }, [t.motion.bootSpinnerDelayMs]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const fail = (e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : 'Could not start');
    };
    resolveBootRoute()
      .then((route) => {
        if (!active) return;
        if (route !== 'unlock') {
          router.replace(pathFor(route));
          return;
        }
        // The Unlock overlay sits over this screen; the session is checked once the PIN opens it.
        unsubscribe = useLock.subscribe((s) => {
          if (s.state !== 'unlocked') return;
          unsubscribe?.();
          resolveAfterUnlock()
            .then((next) => {
              if (active) router.replace(pathFor(next));
            })
            .catch(fail);
        });
      })
      .catch(fail);
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [router, attempt]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.splash,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <StatusBar style="light" />
      {/* the splash image is square with the splash blue in its corners: no radius, no frame */}
      <Image
        source={require('../../assets/images/splash-icon.png')}
        accessibilityRole="image"
        accessibilityLabel="F2H"
        style={{ width: t.sizes.hero, height: t.sizes.hero }}
      />
      {/* below the logo and out of flow, so the logo never moves off the splash position */}
      <View
        style={{
          position: 'absolute',
          left: t.sizes.sheetInset,
          right: t.sizes.sheetInset,
          top: '50%',
          marginTop: t.sizes.hero / 2 + t.spacing.xxl,
          alignItems: 'center',
        }}
      >
        {error ? (
          <Card style={{ alignSelf: 'stretch', gap: t.spacing.md }}>
            <Callout tone="danger">{`Could not start: ${error}`}</Callout>
            <Button variant="secondary" onPress={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </Card>
        ) : slow ? (
          <Animated.View entering={FadeIn.duration(t.motion.glideMs).easing(t.motion.easeOut)}>
            <ActivityIndicator color={t.colors.onPrimary} accessibilityLabel="Starting" />
          </Animated.View>
        ) : null}
      </View>
      {__DEV__ ? (
        <Link href="/(dev)/gallery" asChild>
          <Pressable
            accessibilityRole="link"
            hitSlop={t.spacing.md}
            style={{ position: 'absolute', bottom: insets.bottom + t.spacing.xl }}
          >
            <Text variant="caption" color="onPrimary">
              Component gallery
            </Text>
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}
