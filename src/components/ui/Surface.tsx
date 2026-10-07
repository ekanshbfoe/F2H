import { View, type ViewProps } from 'react-native';

import { useTheme, type ColorToken, type Tokens } from '@/theme';

export interface SurfaceProps extends ViewProps {
  background?: ColorToken;
  padding?: keyof Tokens['spacing'] | 'none';
  radius?: keyof Tokens['radii'] | 'none';
}

/** A plain background block: the base every container builds on. */
export function Surface({
  background = 'surface',
  padding = 'none',
  radius = 'none',
  style,
  ...rest
}: SurfaceProps) {
  const t = useTheme();
  return (
    <View
      {...rest}
      style={[
        { backgroundColor: t.colors[background] },
        padding !== 'none' ? { padding: t.spacing[padding] } : null,
        radius !== 'none' ? { borderRadius: t.radii[radius] } : null,
        style,
      ]}
    />
  );
}
