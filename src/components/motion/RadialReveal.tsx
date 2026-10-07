import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

export interface RadialRevealProps {
  /** When true, a circle grows from the center and the children fade in on top. */
  visible: boolean;
  children: ReactNode;
  /** Fill color token value of the growing circle. */
  color?: string;
  testID?: string;
}

const DOT = 24;

/**
 * Dot → blurred circle → full wipe (approval reference). The container must be
 * positioned by its parent (usually absoluteFill over the surface it replaces).
 */
export function RadialReveal({ visible, children, color, testID }: RadialRevealProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const progress = useSharedValue(0);
  const content = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, reduceMotion ? t.motion.timingMicro : t.motion.timingReveal);
      content.value = withDelay(reduceMotion ? 0 : 160, withTiming(1, t.motion.timingFast));
    } else {
      progress.value = withTiming(0, t.motion.timingMicro);
      content.value = withTiming(0, t.motion.timingMicro);
    }
  }, [
    visible,
    reduceMotion,
    progress,
    content,
    t.motion.timingMicro,
    t.motion.timingReveal,
    t.motion.timingFast,
  ]);

  const diag = Math.hypot(box.w, box.h);
  const maxScale = diag > 0 ? (diag / DOT) * 1.1 : 1;

  const circle = useAnimatedStyle(() => ({
    opacity: progress.value === 0 ? 0 : 1,
    transform: [{ scale: progress.value * maxScale }],
  }));
  const body = useAnimatedStyle(() => ({ opacity: content.value }));

  return (
    <View
      testID={testID}
      pointerEvents={visible ? 'auto' : 'none'}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[StyleSheet.absoluteFill, styles.clip]}
    >
      <Animated.View
        style={[
          styles.dot,
          circle,
          {
            backgroundColor: color ?? t.colors.surface,
            left: box.w / 2 - DOT / 2,
            top: box.h / 2 - DOT / 2,
          },
          t.shadows.floating,
        ]}
      />
      <Animated.View style={[StyleSheet.absoluteFill, body]}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2 },
});
