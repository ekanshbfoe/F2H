import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from '@/theme';

export interface WellProps {
  /** The frame colour; eases between values (focus blue, error red, resting line). */
  frame?: string;
  children?: ReactNode;
  /** Sizing of the whole well (a fixed height, or flex). */
  style?: StyleProp<ViewStyle>;
  /** Layout of the floor that holds the content. */
  floorStyle?: StyleProp<ViewStyle>;
}

/**
 * A recessed well, the counterpart of the raised keys and tiles: a coloured frame, a darker inner
 * wall that shows along the top, and a pale floor. Inputs and read backs (kit words, the
 * fingerprint) sit in wells; things you press stand up from the surface.
 */
export function Well({ frame, children, style, floorStyle }: WellProps) {
  const t = useTheme();
  const b = t.sizes.border;
  const inner = t.radii.md - b;
  return (
    <View style={style}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: t.radii.md,
            backgroundColor: frame ?? t.colors.line,
            transitionProperty: 'backgroundColor',
            transitionDuration: t.motion.transitionMs,
            transitionTimingFunction: t.motion.cssEaseOut,
          },
        ]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { margin: b, borderRadius: inner, backgroundColor: t.colors.lineStrong },
        ]}
      />
      <View
        style={[
          {
            flexGrow: 1,
            margin: b,
            marginTop: b * 2,
            borderRadius: inner,
            backgroundColor: t.colors.canvas,
          },
          floorStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}
