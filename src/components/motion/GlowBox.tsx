import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import { useTheme } from '@/theme';
import { Text } from '@/components/ui';

export type GlowState = 'idle' | 'filled' | 'success' | 'error';

export interface GlowBoxProps {
  /** Single character to show, or empty. */
  value?: string;
  state: GlowState;
  size?: number;
  /** Hide the character (PIN entry). */
  masked?: boolean;
  testID?: string;
}

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/**
 * One box of the passcode reference: a highlight bar pops in when filled, a
 * clockwise border trace runs on success with an inner glow, and an error shakes.
 */
export function GlowBox({ value = '', state, size, masked = false, testID }: GlowBoxProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const box = size ?? t.sizes.pinBox;
  const radius = t.radii.md;
  const stroke = t.sizes.border;
  const perimeter = 2 * (box - stroke) + 2 * (box - stroke) - 8 * radius + 2 * Math.PI * radius;

  const trace = useSharedValue(0);
  const glow = useSharedValue(0);
  const shake = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (state === 'success') {
      trace.value = 0;
      trace.value = withTiming(1, reduceMotion ? t.motion.timingMicro : t.motion.timingTrace);
      glow.value = withTiming(1, t.motion.timingFast);
      scale.value = reduceMotion
        ? 1
        : withSequence(
            withSpring(1.06, t.motion.springSnappy),
            withSpring(1, t.motion.springSnappy),
          );
    } else if (state === 'error') {
      glow.value = withTiming(1, t.motion.timingMicro);
      shake.value = reduceMotion
        ? 0
        : withSequence(
            withTiming(-8, { duration: 50 }),
            withTiming(8, { duration: 50 }),
            withTiming(-6, { duration: 50 }),
            withTiming(6, { duration: 50 }),
            withTiming(0, { duration: 50 }),
          );
    } else {
      trace.value = withTiming(0, t.motion.timingMicro);
      glow.value = withTiming(0, t.motion.timingMicro);
      scale.value =
        state === 'filled' && !reduceMotion
          ? withSequence(withTiming(1.04, { duration: 60 }), withSpring(1, t.motion.springSnappy))
          : 1;
    }
  }, [state, reduceMotion, trace, glow, shake, scale, t.motion]);

  const color = state === 'error' ? t.colors.danger : t.colors.primary;
  const shadow = state === 'error' ? t.shadows.dangerGlow : t.shadows.glow;

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }, { scale: scale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const rectProps = useAnimatedProps(() => ({
    strokeDashoffset: perimeter * (1 - trace.value),
  }));

  return (
    <Animated.View
      testID={testID}
      accessibilityLabel={value ? (masked ? 'Filled' : value) : 'Empty'}
      style={[
        boxStyle,
        {
          width: box,
          height: box,
          borderRadius: radius,
          backgroundColor: state === 'idle' ? t.colors.canvas : t.colors.surface,
          borderWidth: t.sizes.hairline,
          borderColor: state === 'filled' ? t.colors.primary : t.colors.line,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          glowStyle,
          {
            borderRadius: radius,
            backgroundColor: state === 'error' ? t.colors.dangerTint : t.colors.primaryTint,
          },
          shadow,
        ]}
      />
      {state === 'filled' ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: radius,
            right: radius,
            height: t.sizes.border,
            backgroundColor: t.colors.primary,
            borderRadius: t.radii.pill,
          }}
        />
      ) : null}
      <Text variant="pin" color={state === 'error' ? 'danger' : 'ink'}>
        {value ? (masked ? '●' : value) : ''}
      </Text>
      {state === 'success' || state === 'error' ? (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={box} height={box}>
          <AnimatedRect
            x={stroke / 2}
            y={stroke / 2}
            width={box - stroke}
            height={box - stroke}
            rx={radius}
            ry={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${perimeter} ${perimeter}`}
            animatedProps={rectProps}
          />
        </Svg>
      ) : null}
    </Animated.View>
  );
}
