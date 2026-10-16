import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface LensTab {
  key: string;
  label: string;
  icon: IconName;
  /** The filled icon shown while the tab is selected. */
  activeIcon: IconName;
  /** A count in a small red badge (hidden at 0). */
  badge?: number;
}

export interface LensTabBarProps {
  tabs: readonly LensTab[];
  value: string;
  onChange: (key: string) => void;
  /**
   * Where the pages are, as a fractional tab index, when the bar sits over swipeable pages. The
   * lens then rides the pages frame by frame instead of springing on its own.
   */
  position?: SharedValue<number>;
  /**
   * A worklet that moves the pages to a fractional tab index (animated or not). Sliding the lens
   * drives the pages live through it; a tap starts the page move on the UI thread at once.
   */
  scrub?: (index: number, animated: boolean) => void;
  /** The round button beside the bar. */
  action?: {
    icon: IconName;
    label: string;
    onPress: () => void;
    disabled?: boolean;
    testID?: string;
  };
  testID?: string;
}

/** Bar height: an icon over a one line label, with room for the lens around them. */
export const LENS_BAR_HEIGHT = 58;
const BAR = LENS_BAR_HEIGHT;
const PAD = 4;
/** How much the lens stretches per pixel it moved in the last frame, and its cap. */
const STRETCH_PER_PX = 1 / 60;
const STRETCH_MAX = 0.3;

const ACTIVATE = [{ name: 'activate' as const }];

interface TabIconProps {
  tab: LensTab;
  active: boolean;
  width: number;
  onSelect: (key: string) => void;
  testID?: string;
}

/** One tab: icon over label. Becoming active, its icon pops once as the lens arrives. */
const TabIcon = memo(function TabIcon({ tab, active, width, onSelect, testID }: TabIconProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const pop = useSharedValue(1);
  const first = useRef(true);
  const release = t.motion.springRelease;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (active && !reduceMotion) {
      pop.set(withSequence(withTiming(1.18, { duration: 110 }), withSpring(1, release)));
    }
  }, [active, reduceMotion, pop, release]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const color = active ? t.colors.primary : t.colors.muted;
  const badge = tab.badge ?? 0;

  return (
    <View
      accessible
      accessibilityRole="tab"
      accessibilityLabel={badge > 0 ? `${tab.label}, ${badge} waiting` : tab.label}
      accessibilityState={{ selected: active }}
      accessibilityActions={ACTIVATE}
      onAccessibilityAction={(e: AccessibilityActionEvent) => {
        if (e.nativeEvent.actionName === 'activate') onSelect(tab.key);
      }}
      testID={testID}
      style={[styles.center, { width, height: BAR - 2 * PAD, gap: t.spacing.xxs }]}
    >
      <Animated.View style={iconStyle}>
        <Ionicons name={active ? tab.activeIcon : tab.icon} size={t.sizes.icon + 2} color={color} />
        {badge > 0 ? (
          <View
            style={[
              styles.center,
              {
                position: 'absolute',
                top: -t.spacing.xs,
                right: -t.spacing.sm,
                minWidth: t.spacing.lg,
                height: t.spacing.lg,
                paddingHorizontal: t.spacing.xxs,
                borderRadius: t.radii.pill,
                backgroundColor: t.colors.danger,
                borderWidth: t.sizes.border,
                borderColor: t.colors.surface,
              },
            ]}
          >
            <Text variant="caption" color="onPrimary" style={styles.badgeText}>
              {badge > 9 ? '9+' : String(badge)}
            </Text>
          </View>
        ) : null}
      </Animated.View>
      <Text
        variant="caption"
        color={active ? 'primary' : 'muted'}
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
      >
        {tab.label}
      </Text>
    </View>
  );
});

/**
 * A floating bar of tabs with a soft lens behind the selected one, stretching with its speed and
 * settling round again. Over swipeable pages (`position` and `scrub`) the lens rides the pages
 * frame by frame: swipe the pages and it follows, tap a tab and the pages glide there, hold and
 * slide the lens and the pages move under the finger. Without pages it springs on its own. All of
 * it runs on the UI thread.
 */
export function LensTabBar({
  tabs,
  value,
  onChange,
  position,
  scrub,
  action,
  testID,
}: LensTabBarProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const [barWidth, setBarWidth] = useState(0);
  const count = tabs.length;
  const unit = barWidth > 0 ? (barWidth - 2 * PAD) / count : 0;
  const index = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === value),
  );

  const x = useSharedValue(0);
  const speed = useSharedValue(0);
  const lift = useSharedValue(0);
  const unitSv = useSharedValue(0);
  // where the lens was when a slide began (shared: each gesture callback is its own worklet)
  const startX = useSharedValue(0);
  const dragging = useSharedValue(0);
  const glide = useMemo(
    () => (reduceMotion ? { duration: 1 } : { duration: 380, dampingRatio: 0.72 }),
    [reduceMotion],
  );

  // a tab change is rare, so the gesture is simply rebuilt with the new props
  const select = useCallback(
    (key: string) => {
      if (key === value) return;
      Haptics.selectionAsync().catch(() => undefined);
      onChange(key);
    },
    [value, onChange],
  );
  const selectIndex = useCallback(
    (i: number) => {
      const tab = tabs[i];
      if (tab) select(tab.key);
    },
    [tabs, select],
  );

  // the lens follows the selected tab (a tap, the back button, or a release after a slide)
  const placed = useRef(false);
  useEffect(() => {
    if (unit <= 0) return;
    unitSv.set(unit);
    // over pages, the lens is placed by the pages' position instead
    if (position) return;
    if (!placed.current) {
      placed.current = true;
      x.set(index * unit);
      return;
    }
    x.set(withSpring(index * unit, glide));
  }, [index, unit, glide, x, unitSv, position]);

  // the lens sits under the finger while it slides, otherwise where the pages are
  const lensX = useDerivedValue(() =>
    position && dragging.get() === 0 ? position.get() * unitSv.get() : x.get(),
  );

  // stretch comes from how far the lens moved in the last frame: fast moves pull it long
  useAnimatedReaction(
    () => lensX.get(),
    (now, before) => {
      speed.set(before === null ? 0 : now - before);
    },
  );

  const lensStyle = useAnimatedStyle(() => {
    const s = reduceMotion ? 0 : Math.min(Math.abs(speed.get()) * STRETCH_PER_PX, STRETCH_MAX);
    const l = lift.get();
    return {
      transform: [
        { translateX: lensX.get() },
        { scaleX: 1 + s + 0.06 * l },
        { scaleY: 1 - s * 0.35 + 0.06 * l },
      ],
    };
  });

  const gesture = useMemo(() => {
    const tap = Gesture.Tap().onEnd((e, success) => {
      const u = unitSv.get();
      if (!success || u <= 0) return;
      const i = Math.min(count - 1, Math.max(0, Math.floor((e.x - PAD) / u)));
      if (scrub) scrub(i, !reduceMotion);
      scheduleOnRN(selectIndex, i);
    });
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-16, 16])
      .onStart(() => {
        startX.set(lensX.get());
        x.set(lensX.get());
        dragging.set(1);
        lift.set(withTiming(1, { duration: 120 }));
      })
      .onUpdate((e) => {
        const u = unitSv.get();
        const nx = Math.min((count - 1) * u, Math.max(0, startX.get() + e.translationX));
        x.set(nx);
        // the pages follow the lens live
        if (scrub && u > 0) scrub(nx / u, false);
      })
      .onEnd(() => {
        const u = unitSv.get();
        if (u <= 0) return;
        const i = Math.min(count - 1, Math.max(0, Math.round(x.get() / u)));
        if (scrub) scrub(i, true);
        else x.set(withSpring(i * u, glide));
        scheduleOnRN(selectIndex, i);
      })
      .onFinalize(() => {
        dragging.set(0);
        lift.set(withTiming(0, { duration: 160 }));
      });
    return Gesture.Exclusive(pan, tap);
  }, [count, dragging, glide, lensX, lift, reduceMotion, scrub, selectIndex, startX, unitSv, x]);

  const lensH = BAR - 2 * PAD;
  const edge = t.sizes.buttonEdge;

  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
      <GestureDetector gesture={gesture}>
        <View
          accessibilityRole="tablist"
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          style={[
            t.shadows.floating,
            {
              flex: 1,
              height: BAR,
              borderRadius: t.radii.pill,
              backgroundColor: t.colors.surface,
              borderWidth: t.sizes.hairline,
              borderColor: t.colors.line,
            },
          ]}
        >
          {unit > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  top: PAD - t.sizes.hairline,
                  left: PAD - t.sizes.hairline,
                  width: unit,
                  height: lensH,
                  borderRadius: t.radii.pill,
                  backgroundColor: t.colors.primaryTint,
                  borderWidth: t.sizes.hairline,
                  borderColor: t.colors.surface,
                },
                lensStyle,
              ]}
            />
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              paddingHorizontal: PAD - t.sizes.hairline,
              paddingVertical: PAD - t.sizes.hairline,
            }}
          >
            {tabs.map((tab) => (
              <TabIcon
                key={tab.key}
                tab={tab}
                active={tab.key === value}
                width={unit}
                onSelect={select}
                testID={testID ? `${testID}-${tab.key}` : undefined}
              />
            ))}
          </View>
        </View>
      </GestureDetector>
      {action ? (
        // the round button stands up off the screen like a key, and sinks when pressed
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          disabled={action.disabled}
          onPress={action.onPress}
          testID={action.testID}
          style={{
            width: BAR,
            height: BAR + edge,
            opacity: action.disabled ? t.opacity.disabled : 1,
          }}
        >
          {({ pressed }) => (
            <>
              <View
                collapsable={false}
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  { top: edge, borderRadius: t.radii.pill, backgroundColor: t.colors.primaryDark },
                  t.shadows.floating,
                ]}
              />
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.center,
                  {
                    width: BAR,
                    height: BAR,
                    borderRadius: t.radii.pill,
                    backgroundColor: t.colors.primary,
                    transform: [{ translateY: pressed ? edge : 0 }, { scale: pressed ? 0.97 : 1 }],
                    transitionProperty: 'transform',
                    transitionDuration: pressed
                      ? t.motion.timingPressIn.duration
                      : t.motion.glideMs,
                    transitionTimingFunction: t.motion.cssEaseOut,
                  },
                ]}
              >
                <Ionicons name={action.icon} size={t.sizes.iconLg} color={t.colors.onPrimary} />
              </Animated.View>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, lineHeight: 12 },
});
