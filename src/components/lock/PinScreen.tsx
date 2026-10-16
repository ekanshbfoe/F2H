import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  LayoutAnimationConfig,
  useReducedMotion,
  withSpring,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { PinEntry, type PinEntryProps } from './PinEntry';
import { StepDots } from './StepDots';

export interface PinScreenProps {
  /** The big line on the blue header (two lines at most). */
  headline: string;
  /** One short line for the header of a short phone (falls back to `headline`). */
  compactHeadline?: string;
  /** The sheet title: what to type now. */
  title: string;
  /** Two lines at most; the slot is a fixed two lines so the pad never shifts between steps. */
  subtitle?: string;
  /** One line used on a short screen (falls back to `subtitle`). */
  compactSubtitle?: string;
  /** A short flow (choose, confirm): shows the step pill. */
  steps?: { count: number; current: number };
  /** Which way the title slides in when it changes: forward a step, or back to the start. */
  direction?: 'forward' | 'back';
  /** Shows a back button beside the headline. */
  onBack?: () => void;
  entry: Omit<PinEntryProps, 'fill'>;
  /** Under the pad (a quiet text button). */
  footer?: ReactNode;
  /** Covers the app as the unlock gate instead of being a routed screen. */
  overlay?: boolean;
  testID?: string;
}

const BEAR = require('../../../assets/images/bear.png');
/** The cut out bear's height over its width. */
const BEAR_RATIO = 109 / 96;

interface BearProps {
  width: number;
  /** Rise into place on mount (not on the unlock gate, which shows many times a day). */
  rise: boolean;
  /** How much of the bear's foot the sheet hides. */
  hidden: number;
  /** How far the sheet laps over the header. */
  lap: number;
}

/**
 * The family bear, cut out of its square and standing behind the sheet: its arms rest on the
 * sheet's top edge, and a soft light behind it lifts it off the blue. It rises into place once
 * when the screen appears.
 */
function Bear({ width, rise: rises, hidden, lap }: BearProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const height = Math.round(width * BEAR_RATIO);
  const halo = Math.round(width * 1.5);
  // plain values only: a worklet copies everything it closes over to the UI thread
  const fade = { duration: t.motion.timingEnter.duration, easing: t.motion.easeOut };
  const spring = { duration: 420, dampingRatio: t.motion.springRelease.dampingRatio };
  const from = reduceMotion ? 0 : hidden;
  const rise: EntryExitAnimationFunction = () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: from }] },
      animations: {
        opacity: withTiming(1, fade),
        transform: [{ translateY: from === 0 ? 0 : withSpring(0, spring) }],
      },
    };
  };
  return (
    <View
      pointerEvents="none"
      style={{ width, height, marginBottom: lap - hidden, alignSelf: 'flex-end' }}
    >
      <Svg
        width={halo}
        height={halo}
        style={{ position: 'absolute', left: (width - halo) / 2, top: (height - halo) / 2 }}
      >
        <Defs>
          <RadialGradient id="bear-halo" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={t.colors.onPrimary} stopOpacity={0.3} />
            <Stop offset="1" stopColor={t.colors.onPrimary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={halo / 2} cy={halo / 2} rx={halo / 2} ry={halo / 2} fill="url(#bear-halo)" />
      </Svg>
      <Animated.View entering={rises ? rise : undefined}>
        <Image
          source={BEAR}
          accessibilityLabel="F2H bear mascot"
          style={{ width, height }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

/**
 * The shared frame of every PIN screen: a blue header with a big headline and the family bear,
 * then a light sheet lapping over it, holding the title, the boxes and the raised pad pinned to
 * the bottom in the thumb zone. It fits one screen even on an old 320 x 570 dp phone at 1.3
 * text size; only if a long message ever pushes past that does it scroll.
 */
export function PinScreen({
  headline,
  compactHeadline,
  title,
  subtitle,
  compactSubtitle,
  steps,
  direction = 'forward',
  onBack,
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
  const scale = Math.min(fontScale, t.sizes.maxFontScale);
  const gap = compact ? t.spacing.sm : t.spacing.lg;
  // the sheet's rounded top laps over the header by this much, over the foot of the bear
  const lap = t.radii.xxl;
  const headVariant = compact ? 'heading' : 'title';
  const headLines = compact ? 1 : 2;
  const headHeight = Math.ceil(headLines * t.typography[headVariant].lineHeight! * scale);
  // a fixed subtitle slot (one small line when compact, two otherwise): changing copy between
  // steps never moves the boxes or resizes the keys
  const shown = compact ? (compactSubtitle ?? subtitle) : subtitle;
  const subtitleHeight = Math.ceil(
    (compact ? t.typography.caption.lineHeight! : 2 * t.typography.body.lineHeight!) * scale,
  );

  // scrolling only when the content truly overflows: a scroll view that can move would steal a
  // finger that drifts while pressing a key
  const [frame, setFrame] = useState(0);
  const [content, setContent] = useState(0);
  const overflows = content > frame + 1;

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
        { backgroundColor: t.colors.primary },
      ]}
      accessibilityViewIsModal={overlay}
      testID={testID}
    >
      <StatusBar style="light" />
      <ScrollView
        bounces={false}
        overScrollMode="never"
        keyboardShouldPersistTaps="handled"
        scrollEnabled={overflows}
        onLayout={(e) => setFrame(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => setContent(h)}
        contentContainerStyle={styles.grow}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: t.spacing.md,
            paddingTop: insets.top + (compact ? t.spacing.sm : t.spacing.lg),
            paddingHorizontal: t.sizes.sheetInset,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.sm,
              paddingBottom: lap + gap,
            }}
          >
            {onBack ? (
              <Pressable
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={t.spacing.xs}
                style={({ pressed }) => [
                  styles.center,
                  {
                    width: t.sizes.touch,
                    height: t.sizes.touch,
                    borderRadius: t.radii.pill,
                    opacity: pressed ? t.opacity.pressed : 1,
                  },
                ]}
              >
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      borderRadius: t.radii.pill,
                      backgroundColor: t.colors.onPrimary,
                      opacity: 0.16,
                    },
                  ]}
                />
                <Ionicons name="chevron-back" size={t.sizes.iconLg} color={t.colors.onPrimary} />
              </Pressable>
            ) : null}
            <Text
              variant={headVariant}
              color="onPrimary"
              numberOfLines={headLines}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={t.sizes.maxFontScale}
              style={{ flex: 1, height: headHeight }}
            >
              {compact ? (compactHeadline ?? headline) : headline}
            </Text>
          </View>
          <Bear
            width={Math.round(t.sizes.hero * (compact ? 0.6 : 0.9))}
            rise={!overlay}
            hidden={t.spacing.lg}
            lap={lap}
          />
        </View>
        <View
          style={[
            styles.sheet,
            t.shadows.floating,
            {
              marginTop: -lap,
              shadowOffset: { width: 0, height: -t.spacing.xs },
              backgroundColor: t.colors.canvas,
              borderTopLeftRadius: lap,
              borderTopRightRadius: lap,
              paddingTop: compact ? t.spacing.lg : t.spacing.xxl,
              paddingBottom: insets.bottom + (compact ? t.spacing.sm : t.spacing.lg),
              paddingHorizontal: t.sizes.sheetInset,
              gap,
            },
          ]}
        >
          {steps ? <StepDots count={steps.count} current={steps.current} /> : null}
          <LayoutAnimationConfig skipEntering>
            <Animated.View
              key={title}
              entering={enter}
              style={[styles.header, { gap: t.spacing.xs }]}
            >
              <Text
                variant="heading"
                align="center"
                accessibilityRole="header"
                numberOfLines={1}
                maxFontSizeMultiplier={t.sizes.maxFontScale}
              >
                {title}
              </Text>
              <Text
                variant={compact ? 'caption' : 'body'}
                color="muted"
                align="center"
                numberOfLines={compact ? 1 : 2}
                maxFontSizeMultiplier={t.sizes.maxFontScale}
                style={{ height: subtitleHeight }}
              >
                {shown ?? ''}
              </Text>
            </Animated.View>
          </LayoutAnimationConfig>
          <PinEntry {...entry} fill />
          {footer}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', alignSelf: 'stretch' },
  sheet: { flexGrow: 1, alignItems: 'center' },
});
