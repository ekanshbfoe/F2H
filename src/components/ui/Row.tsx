import { Pressable, View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface RowProps extends ViewProps {
  label: string;
  value?: string;
  /** Dashed outline for pending or placeholder rows (approval reference). */
  dashed?: boolean;
  onPress?: () => void;
  trailing?: React.ReactNode;
}

/** Label left, value right, in a soft grey pill (approval reference rows). */
export function Row({ label, value, dashed = false, onPress, trailing, style, ...rest }: RowProps) {
  const t = useTheme();
  const body = (
    <View
      {...rest}
      style={[
        {
          minHeight: t.sizes.buttonHeight,
          backgroundColor: t.colors.canvas,
          borderRadius: t.radii.lg,
          paddingHorizontal: t.spacing.lg,
          paddingVertical: t.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
        },
        dashed
          ? {
              borderWidth: t.sizes.hairline,
              borderStyle: 'dashed',
              borderColor: t.colors.lineStrong,
            }
          : null,
        style,
      ]}
    >
      <Text variant="label" color="primary" style={{ flex: 1 }}>
        {label}
      </Text>
      {value ? (
        <Text variant="label" color="ink" numberOfLines={1} style={{ flexShrink: 1 }}>
          {value}
        </Text>
      ) : null}
      {trailing}
      {onPress ? (
        <Text variant="label" color="muted" accessibilityElementsHidden>
          ›
        </Text>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? t.opacity.pressed : 1 })}
    >
      {body}
    </Pressable>
  );
}
