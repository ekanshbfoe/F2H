import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  LayoutAnimationConfig,
  useReducedMotion,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { PinEntry, type PinEntryProps } from './PinEntry';
import { StepDots } from './StepDots';

export interface PinScreenProps {
  title: string;
  /** Two lines at most; the slot is a fixed two lines so the pad never shifts between steps. */
  subtitle?: string;
  /** One line used on a short screen (falls back to `subtitle`). */
  compactSubtitle?: string;
  /** A short flow (choose, confirm): shows the step pill. */
  steps?: { count: number; current: number };
  /** Which way the title slides in when it changes: forward a step, or back to the start. */
  direction?: 'forward' | 'back';
  /** Drawn above the title (the mascot on the unlock gate). */
  accessory?: ReactNode;
  entry: Omit<PinEntryProps, 'fill'>;
  /** Under the pad (a quiet text button). */
  footer?: ReactNode;
  /** Covers the app as the unlock gate instead of being a routed screen. */
  overlay?: boolean;
  testID?: string;
}

/**
 * The shared frame of every PIN screen: header up top, the recessed boxes under it, the raised
 * pad pinned to the bottom in the thumb zone. It fits one screen even on an old 320 x 570 dp
 * phone, and scrolls rather than clips if a long message ever pushes past that.
 */
export function PinScreen({
  title,
  subtitle,
  compactSubtitle,
  steps,
  direction = 'forward',
  accessory,
  entry,
  footer,
  overlay = false,
  testID,
}: PinScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { height, fontScale } = useWindowDimensions();
  const compact = height < t.sizes.compactHeight;
  const gap = compact ? t.spacing.sm : t.spacing.xl;
  // a fixed subtitle slot (one line when compact, two otherwise): changing copy between steps
  // never moves the boxes or resizes the keys
  const lines = compact ? 1 : 2;
  const shown = compact ? (compactSubtitle ?? subtitle) : subtitle;
  const subtitleHeight = Math.ceil(
    lines * t.typography.body.lineHeight! * Math.min(fontScale, t.sizes.maxFontScale),
  );

  // A new step slides its title in from the side you are heading to, with a fade; reduced
  // motion keeps only the fade. The first title of a screen just appears: the gate shows many
  // times a day and should never make you wait for it.
  const slide = t.motion.stepSlide;
  const dx = reduceMotion ? 0 : direction === 'forward' ? slide : -slide;
  const timing = t.motion.timingStep;
  const enter: EntryExitAnimationFunction = () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateX: dx }] },
      animations: {
        opacity: withTiming(1, timing),
        transform: [{ translateX: withTiming(0, timing) }],
      },
    };
  };

  return (
    <View
      style={[
        overlay ? StyleSheet.absoluteFill : styles.flex,
        { backgroundColor: t.colors.canvas },
      ]}
      accessibilityViewIsModal={overlay}
      testID={testID}
    >
      <ScrollView
        bounces={false}
        overScrollMode="never"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + gap,
          paddingBottom: insets.bottom + t.spacing.lg,
          paddingHorizontal: t.sizes.sheetInset,
          gap,
          alignItems: 'center',
        }}
      >
        {accessory}
        {steps ? <StepDots count={steps.count} current={steps.current} /> : null}
        <LayoutAnimationConfig skipEntering>
          <Animated.View
            key={title}
            entering={enter}
            style={[styles.header, { gap: t.spacing.xs }]}
          >
            <Text variant="title" align="center" accessibilityRole="header">
              {title}
            </Text>
            {shown ? (
              <Text
                variant="body"
                color="muted"
                align="center"
                numberOfLines={lines}
                maxFontSizeMultiplier={t.sizes.maxFontScale}
                style={{ height: subtitleHeight }}
              >
                {shown}
              </Text>
            ) : null}
          </Animated.View>
        </LayoutAnimationConfig>
        <PinEntry {...entry} fill />
        {footer}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { alignItems: 'center', alignSelf: 'stretch' },
});
