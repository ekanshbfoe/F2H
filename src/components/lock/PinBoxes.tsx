import * as Haptics from 'expo-haptics';
import { memo, useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

export type PinBoxesState = 'idle' | 'error' | 'success';

export interface PinBoxesProps {
  /** Digits entered so far. */
  value: string;
  length?: number;
  state?: PinBoxesState;
  testID?: string;
}

interface SlotProps {
  filled: boolean;
  /** The slot the next digit lands in. */
  active: boolean;
  tone: PinBoxesState;
  width: number;
  height: number;
}

/**
 * One recessed well. The keys below are raised; the slots are sunk into the surface: a coloured
 * frame, then a darker inner wall along the top, then a floor a shade darker than the screen.
 * A digit drops in as a glossy bead that pops from the tap's momentum; the frame of the slot the
 * next digit lands in turns blue, so the eye knows where it goes.
 */
const Slot = memo(function Slot({ filled, active, tone, width, height }: SlotProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const bead = useSharedValue(filled ? 1 : 0);

  useEffect(() => {
    bead.set(
      filled
        ? reduceMotion
          ? withTiming(1, t.motion.timingPressIn)
          : withSpring(1, t.motion.springRelease)
        : withTiming(0, t.motion.timingPressIn),
    );
  }, [filled, reduceMotion, bead, t.motion.timingPressIn, t.motion.springRelease]);

  const from = reduceMotion ? 1 : 0.4;
  const beadStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, bead.get() * 2),
    transform: [{ scale: from + bead.get() * (1 - from) }],
  }));

  const frame = t.sizes.border;
  const inner = t.radii.md - frame;
  const dot = t.spacing.lg;
  const beadColor =
    tone === 'error' ? t.colors.danger : tone === 'success' ? t.colors.success : t.colors.primary;
  const frameColor =
    tone === 'error'
      ? t.colors.danger
      : tone === 'success'
        ? t.colors.success
        : active || filled
          ? t.colors.primary
          : t.colors.lineStrong;

  return (
    <View style={{ width, height }}>
      <Animated.View
        style={[
          styles.fill,
          {
            borderRadius: t.radii.md,
            backgroundColor: frameColor,
            transitionProperty: 'backgroundColor',
            transitionDuration: t.motion.transitionMs,
            transitionTimingFunction: t.motion.cssEaseOut,
          },
        ]}
      />
      <View
        style={[
          styles.fill,
          { margin: frame, borderRadius: inner, backgroundColor: t.colors.lineStrong },
        ]}
      />
      <View
        style={[
          styles.fill,
          {
            margin: frame,
            top: frame * 2,
            borderRadius: inner,
            backgroundColor: t.colors.line,
          },
        ]}
      />
      <View style={[styles.fill, styles.center, { top: frame }]}>
        <Animated.View
          style={[
            {
              width: dot,
              height: dot,
              borderRadius: t.radii.pill,
              backgroundColor: beadColor,
              transitionProperty: 'backgroundColor',
              transitionDuration: t.motion.transitionMs,
              transitionTimingFunction: t.motion.cssEaseOut,
            },
            beadStyle,
          ]}
        >
          {/* A specular glint up and to the left turns a flat dot into a bead. */}
          <View
            style={{
              position: 'absolute',
              top: t.spacing.xxs,
              left: t.spacing.xs - t.spacing.xxs,
              width: t.spacing.xs + t.spacing.xxs,
              height: t.spacing.xs,
              borderRadius: t.radii.pill,
              backgroundColor: t.colors.surface,
              opacity: t.opacity.placeholder,
            }}
          />
        </Animated.View>
      </View>
    </View>
  );
});

/** Six recessed slots that announce how many digits are in (AC-11); digits are always masked. */
export function PinBoxes({ value, length = 6, state = 'idle', testID }: PinBoxesProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const shake = useSharedValue(0);
  const shakeEase = t.motion.easeInOut;
  const { width: screen } = useWindowDimensions();
  const gap = t.spacing.sm;
  // 44 wide on a normal phone; narrower on a 320 dp one so six slots always fit the gutters
  const slotWidth = Math.min(
    t.sizes.touch,
    Math.floor((screen - 2 * t.sizes.sheetInset - (length - 1) * gap) / length),
  );
  const slotHeight = Math.min(t.sizes.pinBox, slotWidth + t.spacing.md);

  // One result haptic per result: re-renders and a reduced motion toggle never fire it again.
  const announced = useRef<PinBoxesState>('idle');
  useEffect(() => {
    if (state === announced.current) return;
    announced.current = state;
    if (state === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      if (!reduceMotion) {
        // One decaying shake of the whole row, about 300 ms: a head shake, not a rattle.
        // moving on screen: ease in and out, so each swing reads as a swing
        const step = { duration: 50, easing: shakeEase };
        shake.set(
          withSequence(
            withTiming(-10, step),
            withTiming(9, step),
            withTiming(-6, step),
            withTiming(4, step),
            withTiming(-2, step),
            withTiming(0, step),
          ),
        );
      }
    } else if (state === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
  }, [state, reduceMotion, shake, shakeEase]);

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));

  return (
    <Animated.View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${value.length} of ${length} digits entered`}
      accessibilityLiveRegion="polite"
      style={[{ flexDirection: 'row', justifyContent: 'center', gap }, row]}
    >
      {Array.from({ length }, (_, i) => (
        <Slot
          key={i}
          // a rejected PIN stays on screen, red, while it shakes; the next tap clears it
          filled={state === 'error' || i < value.length}
          active={state === 'idle' && i === value.length}
          tone={state}
          width={slotWidth}
          height={slotHeight}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
