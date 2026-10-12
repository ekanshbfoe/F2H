import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useReducedMotion,
  withDelay,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

export type MedallionTone = 'primary' | 'success' | 'danger';

export interface MedallionProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  tone?: MedallionTone;
  /** Diameter; defaults to 60 percent of the hero size. */
  size?: number;
  /** Settle in on mount, the icon landing a beat later. Off for screens shown many times a day. */
  animateIn?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * A raised coin that carries a state icon: a tinted face resting on a darker lip, the same
 * physical language as the PIN keys, so success, warning and danger moments feel like objects.
 */
export function Medallion({
  icon,
  tone = 'primary',
  size,
  animateIn = true,
  accessibilityLabel,
  testID,
}: MedallionProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const d = size ?? t.sizes.hero * 0.6;
  const edge = t.sizes.buttonEdge;
  const palette = {
    primary: { face: t.colors.primaryTint, ink: t.colors.primary },
    success: { face: t.colors.successTint, ink: t.colors.success },
    danger: { face: t.colors.dangerTint, ink: t.colors.danger },
  }[tone];

  const rise = reduceMotion ? 0 : t.motion.enterRise;
  const from = reduceMotion ? 1 : t.motion.enterScale;
  const tilt = reduceMotion ? '0deg' : t.motion.enterTilt;
  const spring = t.motion.springRelease;
  const timing = t.motion.timingEnter;
  const iconDelay = timing.duration / 2;
  const iconFade = { duration: t.motion.timingMicro.duration, easing: t.motion.easeOut };
  // The coin rises and settles; reduced motion keeps only the fade.
  const coinIn: EntryExitAnimationFunction = () => {
    'worklet';
    return {
      initialValues: {
        opacity: 0,
        transform: [{ translateY: rise }, { scale: from }],
      },
      animations: {
        opacity: withTiming(1, timing),
        transform: [{ translateY: withTiming(0, timing) }, { scale: withTiming(1, timing) }],
      },
    };
  };
  // Then the icon lands with one small rotation that springs home, the only overshoot here.
  const iconIn: EntryExitAnimationFunction = () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ rotate: tilt }] },
      animations: {
        opacity: withDelay(iconDelay, withTiming(1, iconFade)),
        transform: [{ rotate: withDelay(iconDelay, withSpring('0deg', spring)) }],
      },
    };
  };

  return (
    <Animated.View
      entering={animateIn ? coinIn : undefined}
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      style={{ width: d, height: d + edge }}
      testID={testID}
    >
      <View collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View
          style={[
            styles.disc,
            t.shadows.raised,
            {
              top: edge,
              width: d,
              height: d,
              borderRadius: t.radii.pill,
              backgroundColor: t.colors.lineStrong,
            },
          ]}
        />
      </View>
      <View
        style={[
          styles.disc,
          styles.center,
          {
            top: 0,
            width: d,
            height: d,
            borderRadius: t.radii.pill,
            backgroundColor: palette.face,
            borderColor: t.colors.surface,
            borderWidth: t.sizes.border,
          },
        ]}
      >
        <Animated.View entering={animateIn ? iconIn : undefined}>
          <Ionicons name={icon} size={d * ICON_RATIO} color={palette.ink} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/** The icon fills a bit under half the coin. */
const ICON_RATIO = 0.45;

const styles = StyleSheet.create({
  disc: { position: 'absolute', left: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
