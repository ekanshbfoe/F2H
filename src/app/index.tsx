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
 * It is drawn like the native splash (white, the same rounded logo at the same size, centred) with
 * a soft shadow lifting the logo off the page, so opening the app reads as one step. It also shows
 * again for a moment after the PIN gate fades, while the session is checked.
 */
export default function BootScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [slow, setSlow] = useState(false);
  const logo = t.sizes.bootLogo;
  // the corner of the art (23 percent of the side), so the shadow follows the tile's own curve
  const logoRadius = Math.round(logo * 0.23);

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
        backgroundColor: t.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <StatusBar style="dark" />
      {/* The logo as a raised tile: the rounded art over a same shaped blue base that casts the
          soft shadow (Android needs a solid shape to draw elevation from). Same place and width as
          the native splash, so the hand off does not move it. */}
      <View
        style={[
          t.shadows.floating,
          {
            width: logo,
            height: logo,
            borderRadius: logoRadius,
            backgroundColor: t.colors.splash,
          },
        ]}
      >
        <Image
          source={require('../../assets/images/logo-rounded.png')}
          accessibilityRole="image"
          accessibilityLabel="F2H"
          style={{ width: logo, height: logo }}
        />
      </View>
      {/* below the logo and out of flow, so the logo never moves off the splash position */}
      <View
        style={{
          position: 'absolute',
          left: t.sizes.sheetInset,
          right: t.sizes.sheetInset,
          top: '50%',
          marginTop: logo / 2 + t.spacing.xxl,
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
            <ActivityIndicator color={t.colors.primary} accessibilityLabel="Starting" />
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
            <Text variant="caption" color="muted">
              Component gallery
            </Text>
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}
