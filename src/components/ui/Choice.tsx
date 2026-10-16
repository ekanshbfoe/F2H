import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
  /** Read aloud instead of the label (for a short label like "15 s"). */
  accessibilityLabel?: string;
}

export interface ChoiceProps<T extends string | number> {
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  testID?: string;
}

/**
 * A one row segmented choice: a raised white pill glides along a sunken track to the picked
 * option (a transform transition on the UI thread; nothing re-lays out).
 */
export function Choice<T extends string | number>({
  options,
  value,
  onChange,
  accessibilityLabel,
  testID,
}: ChoiceProps<T>) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const pad = t.spacing.xxs;
  const unit = width > 0 ? (width - 2 * pad) / options.length : 0;
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const height = t.sizes.touch;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        height,
        padding: pad,
        borderRadius: t.radii.pill,
        backgroundColor: t.colors.canvas,
        borderWidth: t.sizes.hairline,
        borderColor: t.colors.line,
      }}
    >
      {unit > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            t.shadows.raised,
            {
              position: 'absolute',
              top: pad - t.sizes.hairline,
              left: pad - t.sizes.hairline,
              width: unit,
              height: height - 2 * pad,
              borderRadius: t.radii.pill,
              backgroundColor: t.colors.surface,
              transform: [{ translateX: index * unit }],
              transitionProperty: 'transform',
              transitionDuration: t.motion.glideMs,
              transitionTimingFunction: t.motion.cssEaseInOut,
            },
          ]}
        />
      ) : null}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            onPress={() => onChange(o.value)}
            testID={testID ? `${testID}-${o.value}` : undefined}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text variant="label" color={selected ? 'primary' : 'muted'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
