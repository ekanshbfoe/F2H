import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/theme';

export interface CardDeckProps<T> {
  cards: readonly T[];
  renderCard: (card: T, index: number) => ReactNode;
  keyOf: (card: T) => string;
  onSwipe?: (card: T, direction: 'left' | 'right') => void;
  onEmpty?: () => void;
  height?: number;
  testID?: string;
}

const SWIPE_FRACTION = 0.35;
const SWIPE_VELOCITY = 800;
const MAX_ROTATE = 12;

/**
 * Draggable card stack (onboarding, per working.md): drag left or right, the card
 * tilts with the drag, flies off past the threshold, springs back otherwise.
 */
export function CardDeck<T>({
  cards,
  renderCard,
  keyOf,
  onSwipe,
  onEmpty,
  height = 420,
  testID,
}: CardDeckProps<T>) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const x = useSharedValue(0);
  const y = useSharedValue(0);

  const advance = useCallback(
    (direction: 'left' | 'right') => {
      const card = cards[index];
      if (card !== undefined) onSwipe?.(card, direction);
      const next = index + 1;
      x.set(0);
      y.set(0);
      setIndex(next);
      if (next >= cards.length) onEmpty?.();
    },
    [cards, index, onEmpty, onSwipe, x, y],
  );

  // plain values only: a gesture callback copies what it closes over to the UI thread, and the
  // theme holds values that cannot be copied
  const snap = t.motion.springSnappy;
  const pan = Gesture.Pan()
    .withTestId('card-deck-pan')
    .onUpdate((e) => {
      x.set(e.translationX);
      y.set(e.translationY);
    })
    .onEnd((e) => {
      const past =
        Math.abs(e.translationX) > width * SWIPE_FRACTION || Math.abs(e.velocityX) > SWIPE_VELOCITY;
      if (past) {
        const dir = e.translationX > 0 || e.velocityX > 0 ? 'right' : 'left';
        x.set(
          withTiming(dir === 'right' ? width * 1.5 : -width * 1.5, { duration: 220 }, (done) => {
            if (done) scheduleOnRN(advance, dir);
          }),
        );
      } else {
        x.set(withSpring(0, snap));
        y.set(withSpring(0, snap));
      }
    });

  const top = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.get() },
      { translateY: y.get() },
      {
        rotate: reduceMotion
          ? '0deg'
          : `${interpolate(x.get(), [-width, width], [-MAX_ROTATE, MAX_ROTATE])}deg`,
      },
    ],
  }));
  const under = useAnimatedStyle(() => {
    const p = Math.min(Math.abs(x.get()) / (width * SWIPE_FRACTION), 1);
    return {
      transform: [{ scale: 0.95 + 0.05 * p }, { translateY: 12 - 12 * p }],
      opacity: 0.85 + 0.15 * p,
    };
  });

  const current = cards[index];
  const nextCard = cards[index + 1];

  return (
    <View testID={testID} style={[styles.root, { height }]}>
      {nextCard !== undefined ? (
        <Animated.View key={keyOf(nextCard)} style={[styles.card, under]} pointerEvents="none">
          {renderCard(nextCard, index + 1)}
        </Animated.View>
      ) : null}
      {current !== undefined ? (
        <GestureDetector gesture={pan}>
          <Animated.View
            key={keyOf(current)}
            accessibilityRole="summary"
            accessibilityHint="Swipe left or right to continue"
            style={[styles.card, top]}
          >
            {renderCard(current, index)}
          </Animated.View>
        </GestureDetector>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  card: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
