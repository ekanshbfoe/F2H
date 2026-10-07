import { View, type ViewProps } from 'react-native';

import { useTheme, type Tokens } from '@/theme';

export interface CardProps extends ViewProps {
  /** `raised` is the default 2.5D card; `flat` for nested groups; `floating` for sheets and popovers. */
  elevation?: 'flat' | 'raised' | 'floating';
  padding?: keyof Tokens['spacing'] | 'none';
  radius?: keyof Tokens['radii'];
  /** Dashed outline for placeholders and pending states (approval reference). */
  dashed?: boolean;
}

export function Card({
  elevation = 'raised',
  padding = 'lg',
  radius = 'xl',
  dashed = false,
  style,
  ...rest
}: CardProps) {
  const t = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: dashed ? t.colors.canvas : t.colors.surface,
          borderRadius: t.radii[radius],
        },
        padding !== 'none' ? { padding: t.spacing[padding] } : null,
        elevation === 'raised' ? t.shadows.raised : null,
        elevation === 'floating' ? t.shadows.floating : null,
        dashed
          ? {
              borderWidth: t.sizes.hairline,
              borderStyle: 'dashed',
              borderColor: t.colors.lineStrong,
            }
          : null,
        style,
      ]}
    />
  );
}
