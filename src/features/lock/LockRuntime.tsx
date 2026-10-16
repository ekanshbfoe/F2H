import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  useReducedMotion,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { useAppStateStatus, useAutoLock, useRevokeGuard, useScreenCaptureBlock } from './hooks';
import { useLock } from './lock.store';
import { UnlockScreen } from './screens/UnlockScreen';

/** The longest the gate waits for its success sequence before it leaves anyway. */
const GATE_HOLD_MAX_MS = 1500;

/**
 * Mounted once in the root layout, inside the providers: the Unlock overlay, the auto lock, the
 * revoke guard, the Android screenshot block, the privacy overlay and the wiped navigation.
 */
export function LockRuntime() {
  const state = useLock((s) => s.state);
  // bumped by every lock: a lock during the success hold mounts a fresh gate, never the
  // finished one with its keys at rest
  const generation = useLock((s) => s.generation);
  const gateExit = useGateExit();
  const gated = state === 'locked' || state === 'cooling_down';
  // The right PIN unlocks at once, but the gate stays up while its boxes play the success
  // sequence, then leaves. The vault and the next screen load underneath meanwhile.
  const [holding, setHolding] = useState(false);
  const [wasGated, setWasGated] = useState(gated);
  if (gated !== wasGated) {
    setWasGated(gated);
    setHolding(!gated && state === 'unlocked');
  }
  // never trapped behind the gate if the sequence is cut short
  useEffect(() => {
    if (!holding) return undefined;
    const timer = setTimeout(() => setHolding(false), GATE_HOLD_MAX_MS);
    return () => clearTimeout(timer);
  }, [holding]);
  useAutoLock();
  useRevokeGuard();
  useScreenCaptureBlock();

  useEffect(
    () =>
      useLock.subscribe((s, prev) => {
        if (s.state === 'wiped' && prev.state !== 'wiped') {
          router.replace({
            pathname: '/(lock)/wiped',
            params: { reason: s.wipeReason ?? 'pin_limit' },
          });
        }
      }),
    [],
  );

  return (
    <>
      {gated || holding ? (
        <Animated.View key={generation} style={StyleSheet.absoluteFill} exiting={gateExit}>
          <UnlockScreen onOpened={() => setHolding(false)} />
        </Animated.View>
      ) : null}
      <PrivacyOverlay />
    </>
  );
}

/**
 * The right PIN opens the vault: the gate fades and swells a hair toward you as it goes, so the
 * app reads as revealed underneath rather than swapped in. It is quick (it happens many times a
 * day, right after the PIN check); reduced motion keeps only the fade.
 */
function useGateExit(): EntryExitAnimationFunction {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const grow = reduceMotion ? 1 : t.motion.gateExitScale;
  const timing = { duration: t.motion.timingMicro.duration, easing: t.motion.easeOut };
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 1, transform: [{ scale: 1 }] },
      animations: {
        opacity: withTiming(0, timing),
        transform: [{ scale: withTiming(grow, timing) }],
      },
    };
  };
}

/** Covers everything while the app is not active: the app switcher sees only the mascot (AC-9). */
function PrivacyOverlay() {
  const t = useTheme();
  const status = useAppStateStatus();
  if (status === 'active') return null;
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: t.colors.canvas,
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.spacing.md,
        },
      ]}
      testID="privacy-overlay"
    >
      <Image
        source={require('../../../assets/images/splash-icon.png')}
        accessibilityLabel="F2H"
        style={{ width: t.sizes.hero, height: t.sizes.hero, borderRadius: t.radii.xl }}
      />
      <Text variant="display" color="primary">
        F2H
      </Text>
    </View>
  );
}
