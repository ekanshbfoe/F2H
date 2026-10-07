import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface CalloutProps extends ViewProps {
  children: string;
  tone?: 'info' | 'success' | 'danger';
  icon?: React.ReactNode;
}

/** Tinted explanation box from the approval reference. */
export function Callout({ children, tone = 'info', icon, style, ...rest }: CalloutProps) {
  const t = useTheme();
  const palette = {
    info: { bg: t.colors.skyTint, text: 'primary' as const },
    success: { bg: t.colors.successTint, text: 'success' as const },
    danger: { bg: t.colors.dangerTint, text: 'danger' as const },
  }[tone];
  return (
    <View
      {...rest}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={[
        {
          backgroundColor: palette.bg,
          borderRadius: t.radii.lg,
          padding: t.spacing.lg,
          flexDirection: 'row',
          gap: t.spacing.md,
          alignItems: 'flex-start',
        },
        style,
      ]}
    >
      {icon ? <View accessibilityElementsHidden>{icon}</View> : null}
      <Text variant="label" color={palette.text} style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  );
}
