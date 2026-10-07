import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface BadgeProps extends ViewProps {
  children: string;
  tone?: 'neutral' | 'primary' | 'success' | 'danger' | 'warning';
}

/** Small status pill. Color is always paired with the text itself. */
export function Badge({ children, tone = 'neutral', style, ...rest }: BadgeProps) {
  const t = useTheme();
  const palette = {
    neutral: { bg: t.colors.canvas, text: 'muted' as const },
    primary: { bg: t.colors.primaryTint, text: 'primary' as const },
    success: { bg: t.colors.successTint, text: 'success' as const },
    danger: { bg: t.colors.dangerTint, text: 'danger' as const },
    warning: { bg: '#FFF4DF', text: 'warning' as const },
  }[tone];
  return (
    <View
      {...rest}
      accessibilityRole="text"
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: palette.bg,
          borderRadius: t.radii.pill,
          paddingHorizontal: t.spacing.md,
          paddingVertical: t.spacing.xs,
        },
        style,
      ]}
    >
      <Text variant="caption" color={palette.text}>
        {children}
      </Text>
    </View>
  );
}
