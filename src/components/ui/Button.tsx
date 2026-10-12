import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  children: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leading?: React.ReactNode;
}

/**
 * 2.5D button: a darker bottom edge that the face sinks into on press
 * (approval reference), plus a 0.97 press scale.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = true,
  disabled,
  leading,
  onPressIn,
  onPressOut,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);
  const isDisabled = Boolean(disabled) || loading;

  const face = useAnimatedStyle(() => ({
    transform: [
      { translateY: pressed.get() * t.sizes.buttonEdge },
      { scale: reduceMotion ? 1 : 1 - pressed.get() * (1 - t.motion.pressScale) },
    ],
  }));

  const handleIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (e) => {
      pressed.set(withTiming(1, t.motion.timingMicro));
      onPressIn?.(e);
    },
    [onPressIn, pressed, t.motion.timingMicro],
  );
  const handleOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (e) => {
      pressed.set(withTiming(0, t.motion.timingMicro));
      onPressOut?.(e);
    },
    [onPressOut, pressed, t.motion.timingMicro],
  );

  const palette = {
    primary: { face: t.colors.primary, edge: t.colors.primaryDark, text: 'onPrimary' as const },
    secondary: { face: t.colors.primaryTint, edge: t.colors.lineStrong, text: 'primary' as const },
    danger: { face: t.colors.danger, edge: t.colors.dangerDark, text: 'onPrimary' as const },
    ghost: { face: 'transparent', edge: 'transparent', text: 'primary' as const },
  }[variant];

  const height = size === 'md' ? t.sizes.buttonHeight : t.sizes.touch;

  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPressIn={handleIn}
      onPressOut={handleOut}
      hitSlop={size === 'sm' ? t.spacing.xs : undefined}
      style={[
        styles.outer,
        {
          backgroundColor: palette.edge,
          borderRadius: t.radii.lg,
          paddingBottom: variant === 'ghost' ? 0 : t.sizes.buttonEdge,
          opacity: isDisabled ? t.opacity.disabled : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
      ]}
    >
      <Animated.View
        style={[
          styles.face,
          face,
          {
            height,
            backgroundColor: palette.face,
            borderRadius: t.radii.lg,
            paddingHorizontal: t.spacing.xxl,
            gap: t.spacing.sm,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={t.colors[palette.text]} accessibilityLabel="Loading" />
        ) : (
          <>
            {leading ? <View>{leading}</View> : null}
            <Text variant="button" color={palette.text} numberOfLines={1}>
              {children}
            </Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: { overflow: 'visible' },
  face: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
