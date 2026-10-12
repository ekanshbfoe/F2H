import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { memo, useMemo } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

export interface PinPadProps {
  /** Keep these stable (useCallback); every key is memoised on them. */
  onDigit: (digit: string) => void;
  onDelete: () => void;
  /** Long press on delete. */
  onClear?: () => void;
  disabled?: boolean;
  testID?: string;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'delete'],
] as const;

/** Key down feedback; on Android the system keyboard's own tick, not a vibrator buzz. */
function tick() {
  const done =
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key)
      : Haptics.selectionAsync();
  done.catch(() => undefined);
}

function heavyTick() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

const ACTIVATE: AccessibilityActionInfo[] = [{ name: 'activate' }];

/** Screen readers have no finger on the key, so they commit through the activate action. */
function onActivate(disabled: boolean, commit: () => void) {
  return (e: AccessibilityActionEvent) => {
    if (!disabled && e.nativeEvent.actionName === 'activate') commit();
  };
}

interface DigitKeyProps {
  size: number;
  label: string;
  disabled: boolean;
  onDigit: (digit: string) => void;
  testID?: string;
}

/**
 * A physical key: a white face resting on a darker lip that carries the contact shadow. On touch
 * down the face sinks the full edge height onto the lip and tints, on release it springs back.
 * The press is read by a native tap gesture and animated on the UI thread, so the key goes down
 * at once even while JavaScript is busy with the previous digit.
 */
const DigitKey = memo(function DigitKey({ size, label, disabled, onDigit, testID }: DigitKeyProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const edge = reduceMotion ? 0 : t.sizes.buttonEdge;
  const shrink = reduceMotion ? 0 : 1 - t.motion.pressScale;
  const rest = t.colors.surface;
  const down = t.colors.primaryTint;
  const pressIn = t.motion.timingPressIn;
  const release = t.motion.springRelease;

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .enabled(!disabled)
        .maxDuration(10_000)
        .onBegin(() => {
          pressed.set(withTiming(1, pressIn));
          scheduleOnRN(tick);
        })
        .onEnd((_e, success) => {
          if (success) scheduleOnRN(onDigit, label);
        })
        .onFinalize(() => {
          pressed.set(withSpring(0, release));
        })
        .withTestId(testID ?? `pin-key-${label}`),
    [disabled, label, onDigit, pressIn, pressed, release, testID],
  );

  const face = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(pressed.get(), [0, 1], [rest, down]),
    transform: [{ translateY: pressed.get() * edge }, { scale: 1 - pressed.get() * shrink }],
  }));

  const round = { width: size, height: size, borderRadius: t.radii.pill };
  return (
    <GestureDetector gesture={tap}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        accessibilityActions={ACTIVATE}
        onAccessibilityAction={onActivate(disabled, () => onDigit(label))}
        style={{ width: size, height: size + t.sizes.buttonEdge }}
      >
        {/* Its own layer, so Android's elevation ordering can never lift the lip over the face. */}
        <View collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View
            style={[
              styles.layer,
              round,
              t.shadows.raised,
              { top: t.sizes.buttonEdge, backgroundColor: t.colors.lineStrong },
            ]}
          />
        </View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.layer,
            styles.center,
            round,
            { top: 0, borderColor: t.colors.line, borderWidth: t.sizes.hairline },
            face,
          ]}
        >
          <Text variant="pin" maxFontSizeMultiplier={1.3}>
            {label}
          </Text>
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

interface DeleteKeyProps {
  size: number;
  disabled: boolean;
  onDelete: () => void;
  onClear?: () => void;
}

/** Delete stays flat (a glyph, not a key) so the ten digits own the depth. Hold to clear. */
const DeleteKey = memo(function DeleteKey({ size, disabled, onDelete, onClear }: DeleteKeyProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const grow = reduceMotion ? 0 : 0.1;
  const shrink = reduceMotion ? 0 : 0.08;
  const pressIn = t.motion.timingPressIn;
  const release = t.motion.springRelease;

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .enabled(!disabled)
      .maxDuration(10_000)
      .onBegin(() => {
        pressed.set(withTiming(1, pressIn));
        scheduleOnRN(tick);
      })
      .onEnd((_e, success) => {
        if (success) scheduleOnRN(onDelete);
      })
      .onFinalize(() => {
        pressed.set(withSpring(0, release));
      })
      .withTestId('pin-key-delete');
    if (!onClear) return tap;
    const hold = Gesture.LongPress()
      .enabled(!disabled)
      .minDuration(450)
      .onStart(() => {
        scheduleOnRN(heavyTick);
        scheduleOnRN(onClear);
      })
      .withTestId('pin-key-clear');
    return Gesture.Exclusive(hold, tap);
  }, [disabled, onClear, onDelete, pressIn, pressed, release]);

  const halo = useAnimatedStyle(() => ({
    opacity: pressed.get(),
    transform: [{ scale: 1 - grow + pressed.get() * grow }],
  }));
  const glyph = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.get() * shrink }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel="Delete"
        accessibilityHint={onClear ? 'Hold to clear every digit' : undefined}
        accessibilityState={{ disabled }}
        accessibilityActions={
          onClear ? [...ACTIVATE, { name: 'longpress', label: 'Clear' }] : ACTIVATE
        }
        onAccessibilityAction={(e) => {
          if (disabled) return;
          if (e.nativeEvent.actionName === 'activate') onDelete();
          if (e.nativeEvent.actionName === 'longpress') onClear?.();
        }}
        style={[styles.center, { width: size, height: size + t.sizes.buttonEdge }]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.layer,
            {
              width: size,
              height: size,
              borderRadius: t.radii.pill,
              top: t.sizes.buttonEdge / 2,
              backgroundColor: t.colors.primaryTint,
            },
            halo,
          ]}
        />
        <Animated.View style={glyph}>
          <Ionicons name="backspace-outline" size={t.sizes.iconLg} color={t.colors.ink} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

/** Numeric pad with labelled 44 pt or larger keys (AC-11). The reference has none; this is F2H's own. */
export function PinPad({ onDigit, onDelete, onClear, disabled = false, testID }: PinPadProps) {
  const t = useTheme();
  const size = Math.max(t.sizes.touch, t.sizes.pinBoxLg + t.spacing.sm);
  return (
    <View
      testID={testID}
      style={{
        gap: t.spacing.md,
        alignSelf: 'center',
        opacity: disabled ? t.opacity.disabled : 1,
      }}
    >
      {ROWS.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: t.spacing.xxl }}>
          {row.map((k, c) => {
            if (k === '') return <View key={c} style={{ width: size }} />;
            if (k === 'delete') {
              return (
                <DeleteKey
                  key={c}
                  size={size}
                  disabled={disabled}
                  onDelete={onDelete}
                  onClear={onClear}
                />
              );
            }
            return <DigitKey key={c} size={size} label={k} disabled={disabled} onDigit={onDigit} />;
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
