import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

export interface PinProgressProps {
  visible: boolean;
  label?: string;
}

/**
 * The visible "working" state while scrypt runs (AC-2): a bar sweeping on the UI thread, so a
 * stall in JavaScript on the old phone never looks like a freeze.
 */
export function PinProgress({ visible, label = 'Checking your PIN' }: PinProgressProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(0);

  useEffect(() => {
    if (visible && !reduceMotion) {
      x.value = 0;
      x.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
    } else {
      x.value = 0;
    }
  }, [visible, reduceMotion, x]);

  const bar = useAnimatedStyle(() => ({ left: `${x.value * 60}%` }));

  if (!visible) return null;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ alignSelf: 'stretch', gap: t.spacing.sm, alignItems: 'center' }}
    >
      <View
        style={{
          alignSelf: 'stretch',
          height: t.sizes.border * 2,
          borderRadius: t.radii.pill,
          backgroundColor: t.colors.primaryTint,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[
            bar,
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: '40%',
              borderRadius: t.radii.pill,
              backgroundColor: t.colors.primary,
            },
          ]}
        />
      </View>
      <Text variant="caption" color="muted">
        {label}
      </Text>
    </View>
  );
}
