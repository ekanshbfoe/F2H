import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type DimensionValue } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
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

/** How far each item trails the one before it, as a share of the whole bloom. */
const STAGGER = 0.12;
/** Where an item starts, as a share of its size, before it grows into place. */
const SEED_SCALE = 0.55;
/** How far an item slides in from the button, sideways and per row of height. */
const TRAVEL_X = 24;
const TRAVEL_Y = 22;
/** Share of the parent's width the stack of rows takes. */
const WIDTH: DimensionValue = '72%';
/** A drag shorter than this is still a tap on the button. */
const DRAG_START = 6;

/**
 * Where the button was last left, as a share of its parent, so the next file opens with the
 * button where the person put it. Null until they first move it (bottom right corner).
 */
let remembered: { fx: number; fy: number } | null = null;

function remember(fx: number, fy: number) {
  remembered = { fx, fy };
}

type Spot = { x: number; y: number };

/**
 * A round button that blooms a stack of rows and a bar of round actions out of itself (the
 * Apple Books reading menu): the rows grow out of the button, one after another, and fold back
 * into it on close. The button can be dragged anywhere over its parent; the rows open above or
 * below it and to its left or right, whichever side has the room. Lay it over its parent; it
 * fills the parent. Tapping outside the rows closes it.
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
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const size = t.sizes.touch;
  const gap = t.spacing.sm;

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMounted(true);
  }

  useEffect(() => {
    if (open) {
      progress.set(withTiming(1, reduceMotion ? t.motion.timingFast : t.motion.timingSheet));
    } else if (mounted) {
      progress.set(
        withTiming(0, t.motion.timingFast, (done) => {
          if (done) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [open, mounted, reduceMotion, progress, t.motion.timingFast, t.motion.timingSheet]);

  const place = (w: number, h: number) => {
    setBox({ w, h });
    const maxX = Math.max(0, w - size);
    const maxY = Math.max(0, h - size);
    const next = remembered
      ? { x: remembered.fx * maxX, y: remembered.fy * maxY }
      : { x: maxX, y: maxY };
    x.set(next.x);
    y.set(next.y);
    setSpot(next);
  };

  const settle = (nx: number, ny: number) => {
    setSpot({ x: nx, y: ny });
    if (box) {
      remember(box.w > size ? nx / (box.w - size) : 1, box.h > size ? ny / (box.h - size) : 1);
    }
  };

  // plain numbers only: a gesture callback copies what it closes over to the UI thread
  const maxX = box ? Math.max(0, box.w - size) : 0;
  const maxY = box ? Math.max(0, box.h - size) : 0;
  const drag = Gesture.Pan()
    .enabled(box !== null)
    .minDistance(DRAG_START)
    .onStart(() => {
      startX.set(x.get());
      startY.set(y.get());
      scheduleOnRN(onOpenChange, false);
    })
    .onUpdate((e) => {
      x.set(Math.min(maxX, Math.max(0, startX.get() + e.translationX)));
      y.set(Math.min(maxY, Math.max(0, startY.get() + e.translationY)));
    })
    .onEnd(() => {
      scheduleOnRN(settle, x.get(), y.get());
    });

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
  }));

  // the rows open toward the roomier side of the button
  const above = !box || !spot || spot.y + size / 2 > box.h / 2;
  const right = !box || !spot || spot.x + size / 2 > box.w / 2;
  const menuPlace =
    box && spot
      ? {
          ...(above ? { bottom: box.h - spot.y + gap } : { top: spot.y + size + gap }),
          ...(right ? { right: box.w - spot.x - size } : { left: spot.x }),
        }
      : { bottom: size + gap, right: 0 };

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
  const item = { progress, count, above, right, still: reduceMotion };

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      testID={testID}
      onLayout={(e) => place(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}
    >
      {mounted ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => onOpenChange(false)}
          accessibilityRole="button"
          accessibilityLabel={`Close ${label.toLowerCase()}`}
        />
      ) : null}
      {mounted ? (
        <View
          style={[styles.menu, menuPlace, { gap: t.spacing.xs, width: WIDTH }]}
          pointerEvents="box-none"
        >
          {rows.map((r, i) => (
            <BloomItem key={r.key} order={i} {...item}>
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
            <BloomItem order={rows.length} {...item}>
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
      <GestureDetector gesture={drag}>
        <Animated.View
          style={[box ? styles.free : styles.corner, box ? buttonStyle : null]}
          pointerEvents="box-none"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint="Drag to move it"
            accessibilityState={{ expanded: open }}
            onPress={() => onOpenChange(!open)}
            hitSlop={t.spacing.xs}
            testID={testID ? `${testID}-toggle` : undefined}
            style={({ pressed }) => [
              t.shadows.floating,
              {
                width: size,
                height: size,
                borderRadius: t.radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? t.colors.primaryDark : t.colors.primary,
              },
            ]}
          >
            <Ionicons name={open ? 'close' : icon} size={t.sizes.icon} color={t.colors.onPrimary} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** One item of the bloom: it trails the one before it and grows out of the button. */
function BloomItem({
  progress,
  order,
  count,
  above,
  right,
  still,
  children,
}: {
  progress: SharedValue<number>;
  order: number;
  count: number;
  above: boolean;
  right: boolean;
  still: boolean;
  children: React.ReactNode;
}) {
  // the rows further from the button travel further back into it
  const reach = above ? count - order : order + 1;
  const dirX = right ? 1 : -1;
  const dirY = above ? 1 : -1;
  const span = 1 + (count - 1) * STAGGER;
  const style = useAnimatedStyle(() => {
    const local = Math.min(1, Math.max(0, progress.get() * span - order * STAGGER));
    if (still) return { opacity: local };
    const away = 1 - local;
    return {
      opacity: local,
      transform: [
        { translateX: away * TRAVEL_X * dirX },
        { translateY: away * reach * TRAVEL_Y * dirY },
        { scale: SEED_SCALE + (1 - SEED_SCALE) * local },
      ],
    };
  });
  const origin = `${right ? 'right' : 'left'} ${above ? 'bottom' : 'top'}`;
  return <Animated.View style={[{ transformOrigin: origin }, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  menu: { position: 'absolute' },
  free: { position: 'absolute', left: 0, top: 0 },
  corner: { position: 'absolute', right: 0, bottom: 0 },
  actions: { flexDirection: 'row' },
  value: { flexShrink: 1, textAlign: 'right' },
});
