import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

export interface SegmentedToggleProps {
  options: readonly [string, string];
  value: 0 | 1;
  onChange: (next: 0 | 1) => void;
  /** Charcoal variant for the login card. */
  onDark?: boolean;
  testID?: string;
}

const DROP_FROM = -14;

/**
 * Two option toggle from the login reference: the pill slides on an under damped
 * spring and visibly overshoots the track; the label that becomes inactive drops in.
 */
export function SegmentedToggle({
  options,
  value,
  onChange,
  onDark = false,
  testID,
}: SegmentedToggleProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const [trackW, setTrackW] = useState(0);
  const mode = useSharedValue(value);
  const drop0 = useSharedValue(0);
  const drop1 = useSharedValue(0);
  const prev = useRef(value);

  useEffect(() => {
    mode.value = reduceMotion
      ? withTiming(value, t.motion.timingFast)
      : withSpring(value, t.motion.springOvershoot);
    if (prev.current !== value && !reduceMotion) {
      const dropped = value === 0 ? drop1 : drop0;
      dropped.value = DROP_FROM;
      dropped.value = withSpring(0, t.motion.springSnappy);
    }
    prev.current = value;
  }, [
    value,
    reduceMotion,
    mode,
    drop0,
    drop1,
    t.motion.springOvershoot,
    t.motion.springSnappy,
    t.motion.timingFast,
  ]);

  const pillW = trackW / 2;
  const track = onDark ? 'rgba(255,255,255,0.18)' : t.colors.primaryTint;
  const pill = onDark ? t.colors.surface : t.colors.primary;
  const active = onDark ? t.colors.ink : t.colors.onPrimary;
  const inactive = onDark ? 'rgba(255,255,255,0.7)' : t.colors.primary;

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: mode.value * pillW }] }));
  const label0 = useAnimatedStyle(() => ({
    color: interpolateColor(mode.value, [0, 1], [active, inactive]),
    transform: [{ translateY: drop0.value }],
  }));
  const label1 = useAnimatedStyle(() => ({
    color: interpolateColor(mode.value, [0, 1], [inactive, active]),
    transform: [{ translateY: drop1.value }],
  }));

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
      style={[
        styles.track,
        { height: t.sizes.toggleHeight, borderRadius: t.radii.pill, backgroundColor: track },
      ]}
    >
      {trackW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            pillStyle,
            { width: pillW, backgroundColor: pill, borderRadius: t.radii.pill },
            t.shadows.raised,
          ]}
        />
      ) : null}
      {options.map((label, i) => (
        <Pressable
          key={label}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === i }}
          accessibilityLabel={label}
          onPress={() => onChange(i as 0 | 1)}
          style={styles.option}
        >
          <Animated.Text style={[t.typography.label, i === 0 ? label0 : label1]} numberOfLines={1}>
            {label}
          </Animated.Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', overflow: 'visible', alignItems: 'stretch' },
  pill: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  option: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 42 },
});
