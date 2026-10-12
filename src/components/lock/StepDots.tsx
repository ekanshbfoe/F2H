import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from '@/theme';

export interface StepDotsProps {
  count: number;
  /** Zero based. */
  current: number;
  testID?: string;
}

/**
 * Where you are in a short PIN flow (choose, then confirm). A blue pill glides between the dots,
 * moved by a transform transition on the UI thread; the dots never re-lay out.
 */
export function StepDots({ count, current, testID }: StepDotsProps) {
  const t = useTheme();
  const dot = t.spacing.sm;
  const gap = t.spacing.sm;
  const pill = t.spacing.xl;
  const x = current * (dot + gap) - (pill - dot) / 2;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${count}`}
      style={{
        flexDirection: 'row',
        gap,
        alignSelf: 'center',
        paddingHorizontal: (pill - dot) / 2,
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            width: dot,
            height: dot,
            borderRadius: t.radii.pill,
            backgroundColor: t.colors.lineStrong,
          }}
        />
      ))}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: (pill - dot) / 2,
          width: pill,
          height: dot,
          borderRadius: t.radii.pill,
          backgroundColor: t.colors.primary,
          transform: [{ translateX: x }],
          transitionProperty: 'transform',
          transitionDuration: t.motion.glideMs,
          transitionTimingFunction: t.motion.cssEaseInOut,
        }}
      />
    </View>
  );
}
