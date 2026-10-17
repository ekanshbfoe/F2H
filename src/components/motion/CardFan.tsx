import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

export interface CardFanProps {
  /** The front card's content. */
  children: ReactNode;
  testID?: string;
}

/** How far the two cards behind turn out, and how far they slide, once fanned. */
const FAN_DEG = 7;
const FAN_SHIFT = 14;
/** The front card's turn in depth as it lands, in degrees, then back to flat. */
const WOBBLE = [-12, 7, -3, 0];
const WOBBLE_STEP_MS = 160;
const FAN_DELAY_MS = 180;

/**
 * The "All set" card from the approval reference: a card lands with a short turn in depth and
 * the two cards behind it fan out to the sides. One smooth pass, no bounce. Reduced motion shows
 * the fanned stack at rest.
 */
export function CardFan({ children, testID }: CardFanProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const fan = useSharedValue(reduceMotion ? 1 : 0);
  const turn = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    const ease = t.motion.easeOut;
    fan.set(withDelay(FAN_DELAY_MS, withTiming(1, { duration: 420, easing: ease })));
    turn.set(
      withSequence(
        ...WOBBLE.map((deg) => withTiming(deg, { duration: WOBBLE_STEP_MS, easing: ease })),
      ),
    );
  }, [fan, turn, reduceMotion, t.motion.easeOut]);

  const front = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateY: `${turn.get()}deg` },
      { rotateX: `${turn.get() * 0.4}deg` },
    ],
  }));

  const card = {
    borderRadius: t.radii.lg,
    padding: t.spacing.lg,
  };

  return (
    <View style={styles.root} testID={testID}>
      <BackCard fan={fan} side={-1} style={[card, { backgroundColor: t.colors.skyTint }]} />
      <BackCard fan={fan} side={1} style={[card, { backgroundColor: t.colors.sky }]} />
      <Animated.View
        style={[card, t.shadows.floating, { backgroundColor: t.colors.primary }, front]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

function BackCard({ fan, side, style }: { fan: SharedValue<number>; side: -1 | 1; style: object }) {
  const motion = useAnimatedStyle(() => ({
    transform: [
      { translateX: side * FAN_SHIFT * fan.get() },
      { rotate: `${side * FAN_DEG * fan.get()}deg` },
    ],
  }));
  return <Animated.View style={[StyleSheet.absoluteFill, style, motion]} />;
}

const styles = StyleSheet.create({
  root: { alignSelf: 'center', width: '78%' },
});
