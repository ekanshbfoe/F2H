import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Shows a back arrow on the left when provided. */
  onBack?: () => void;
  children: React.ReactNode;
  /** Pinned under the content (usually a Button). */
  footer?: React.ReactNode;
  testID?: string;
}

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

/**
 * Bottom sheet from the approval reference: white, inset 20 from the edges,
 * 28 radius, grab handle, sky blue header icons. Springs up, drags down to close.
 */
export function Sheet({ open, onClose, title, onBack, children, footer, testID }: SheetProps) {
  const t = useTheme();
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);
  const y = useSharedValue(screenH);
  const scrim = useSharedValue(0);

  // Adjust state when the prop changes, during render (React's documented pattern).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMounted(true);
  }

  useEffect(() => {
    if (open) {
      scrim.set(withTiming(1, t.motion.timingFast));
      y.set(reduceMotion ? withTiming(0, t.motion.timingFast) : withSpring(0, t.motion.springSoft));
    } else if (mounted) {
      scrim.set(withTiming(0, t.motion.timingFast));
      y.set(
        withTiming(screenH, t.motion.timingFast, (done) => {
          if (done) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [open, mounted, reduceMotion, scrim, screenH, t.motion.springSoft, t.motion.timingFast, y]);

  // plain values only: a gesture callback copies what it closes over to the UI thread, and the
  // theme holds values that cannot be copied
  const settle = t.motion.springSoft;
  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      y.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        scheduleOnRN(onClose);
      } else {
        y.set(withSpring(0, settle));
      }
    });

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.get() }));

  if (!mounted) return null;

  return (
    <Modal transparent visible statusBarTranslucent onRequestClose={onClose} animationType="none">
      <View style={styles.root} testID={testID}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.scrim }, scrimStyle]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close sheet"
          />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View
            accessibilityViewIsModal
            accessibilityLabel={title}
            style={[
              styles.panel,
              panelStyle,
              t.shadows.floating,
              {
                backgroundColor: t.colors.surface,
                borderRadius: t.radii.xxl,
                marginHorizontal: t.sizes.sheetInset,
                marginBottom: Math.max(insets.bottom, t.sizes.sheetInset),
                padding: t.spacing.xl,
                gap: t.spacing.lg,
              },
            ]}
          >
            <View
              accessibilityElementsHidden
              style={{
                alignSelf: 'center',
                width: t.sizes.sheetHandleWidth,
                height: t.sizes.sheetHandleHeight,
                borderRadius: t.radii.pill,
                backgroundColor: t.colors.lineStrong,
              }}
            />
            <View style={styles.header}>
              <HeaderIcon name="chevron-back" label="Back" onPress={onBack} />
              <Text
                variant="heading"
                color="sky"
                align="center"
                style={styles.title}
                accessibilityRole="header"
              >
                {title}
              </Text>
              <HeaderIcon name="close" label="Close" onPress={onClose} />
            </View>
            <View style={{ gap: t.spacing.md }}>{children}</View>
            {footer ? <View style={{ marginTop: t.spacing.sm }}>{footer}</View> : null}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

function HeaderIcon({
  name,
  label,
  onPress,
}: {
  name: 'chevron-back' | 'close';
  label: string;
  onPress?: () => void;
}) {
  const t = useTheme();
  if (!onPress) return <View style={{ width: t.sizes.touch }} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={t.spacing.xs}
      style={({ pressed }) => ({
        width: t.sizes.touch,
        height: t.sizes.touch,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? t.opacity.pressed : 1,
      })}
    >
      <Ionicons name={name} size={t.sizes.iconLg} color={t.colors.sky} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  panel: { overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
});
