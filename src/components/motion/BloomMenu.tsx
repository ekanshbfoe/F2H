import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface BloomRow {
  key: string;
  label: string;
  value: string;
}

export interface BloomAction {
  key: string;
  icon: IconName;
  /** Read by screen readers; the button itself shows only the icon. */
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

export interface BloomMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: BloomRow[];
  actions?: BloomAction[];
  /** Read by screen readers for the corner button. */
  label?: string;
  icon?: IconName;
  testID?: string;
}

/** How far each item trails the one above it, as a share of the whole bloom. */
const STAGGER = 0.12;
/** Where an item starts, as a share of its size, before it grows into place. */
const SEED_SCALE = 0.55;
/** How far an item slides in from the button, sideways and per row of height. */
const TRAVEL_X = 24;
const TRAVEL_Y = 22;
/** Share of the parent's width the stack of rows takes. */
const WIDTH = '72%';
const OPEN = { duration: 380, dampingRatio: 0.78 } as const;

/**
 * A corner button that blooms a stack of rows and a bar of round actions out of itself (the
 * Apple Books reading menu): the rows grow up and to the left from the button, the top one
 * leading, and fold back into it on close, the bottom one first. Lay it over its parent; it fills
 * the parent and anchors to the bottom right corner. Tapping outside the rows closes it.
 */
export function BloomMenu({
  open,
  onOpenChange,
  rows,
  actions = [],
  label = 'Details',
  icon = 'information',
  testID,
}: BloomMenuProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMounted(true);
  }

  useEffect(() => {
    if (open) {
      progress.set(reduceMotion ? withTiming(1, t.motion.timingFast) : withSpring(1, OPEN));
    } else if (mounted) {
      progress.set(
        withTiming(0, t.motion.timingFast, (done) => {
          if (done) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [open, mounted, reduceMotion, progress, t.motion.timingFast]);

  const count = rows.length + (actions.length > 0 ? 1 : 0);
  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: t.spacing.lg,
    minHeight: t.sizes.touch,
    paddingHorizontal: t.spacing.lg,
    borderRadius: t.radii.lg,
    backgroundColor: t.colors.surface,
    borderWidth: t.sizes.hairline,
    borderColor: t.colors.line,
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID={testID}>
      {mounted ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => onOpenChange(false)}
          accessibilityRole="button"
          accessibilityLabel={`Close ${label.toLowerCase()}`}
        />
      ) : null}
      <View style={[styles.anchor, { gap: t.spacing.sm }]} pointerEvents="box-none">
        {mounted ? (
          <View style={{ gap: t.spacing.xs, width: WIDTH }} pointerEvents="box-none">
            {rows.map((r, i) => (
              <BloomItem
                key={r.key}
                progress={progress}
                order={i}
                count={count}
                still={reduceMotion}
              >
                <View style={[rowStyle, t.shadows.raised]}>
                  <Text variant="caption" color="muted">
                    {r.label}
                  </Text>
                  <Text variant="label" color="ink" numberOfLines={1} style={styles.value}>
                    {r.value}
                  </Text>
                </View>
              </BloomItem>
            ))}
            {actions.length > 0 ? (
              <BloomItem progress={progress} order={rows.length} count={count} still={reduceMotion}>
                <View style={[styles.actions, { gap: t.spacing.xs }]}>
                  {actions.map((a) => (
                    <Pressable
                      key={a.key}
                      accessibilityRole="button"
                      accessibilityLabel={a.label}
                      disabled={a.disabled}
                      onPress={a.onPress}
                      testID={testID ? `${testID}-${a.key}` : undefined}
                      style={({ pressed }) => [
                        rowStyle,
                        t.shadows.raised,
                        {
                          flex: 1,
                          paddingHorizontal: 0,
                          justifyContent: 'center',
                          backgroundColor:
                            a.tone === 'danger' && pressed
                              ? t.colors.dangerTint
                              : pressed
                                ? t.colors.primaryTint
                                : t.colors.surface,
                          opacity: a.disabled ? t.opacity.disabled : 1,
                        },
                      ]}
                    >
                      <Ionicons
                        name={a.icon}
                        size={t.sizes.icon}
                        color={a.tone === 'danger' ? t.colors.danger : t.colors.primary}
                      />
                    </Pressable>
                  ))}
                </View>
              </BloomItem>
            ) : null}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ expanded: open }}
          onPress={() => onOpenChange(!open)}
          hitSlop={t.spacing.xs}
          testID={testID ? `${testID}-toggle` : undefined}
          style={({ pressed }) => [
            t.shadows.floating,
            {
              alignSelf: 'flex-end',
              width: t.sizes.touch,
              height: t.sizes.touch,
              borderRadius: t.radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? t.colors.primaryDark : t.colors.primary,
            },
          ]}
        >
          <Ionicons name={open ? 'close' : icon} size={t.sizes.icon} color={t.colors.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

/** One item of the bloom: it trails the item above it and grows out of the corner button. */
function BloomItem({
  progress,
  order,
  count,
  still,
  children,
}: {
  progress: SharedValue<number>;
  order: number;
  count: number;
  still: boolean;
  children: React.ReactNode;
}) {
  // the rows further from the button travel further back into it
  const reach = count - order;
  const span = 1 + (count - 1) * STAGGER;
  const style = useAnimatedStyle(() => {
    const local = Math.min(1, Math.max(0, progress.get() * span - order * STAGGER));
    if (still) return { opacity: local };
    const away = 1 - local;
    return {
      opacity: local,
      transform: [
        { translateX: away * TRAVEL_X },
        { translateY: away * reach * TRAVEL_Y },
        { scale: SEED_SCALE + (1 - SEED_SCALE) * local },
      ],
    };
  });
  return (
    <Animated.View style={[{ transformOrigin: 'right bottom' }, style]}>{children}</Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', right: 0, bottom: 0, left: 0, alignItems: 'flex-end' },
  actions: { flexDirection: 'row' },
  value: { flexShrink: 1, textAlign: 'right' },
});
