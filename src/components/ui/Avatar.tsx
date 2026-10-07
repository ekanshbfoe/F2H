import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface AvatarProps {
  name: string;
  size?: 'md' | 'lg';
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Initials on a primary tint circle (no photos in a vault). */
export function Avatar({ name, size = 'md' }: AvatarProps) {
  const t = useTheme();
  const d = size === 'md' ? t.sizes.avatar : t.sizes.avatar * 1.5;
  return (
    <View
      accessibilityLabel={name}
      accessibilityRole="image"
      style={{
        width: d,
        height: d,
        borderRadius: d / 2,
        backgroundColor: t.colors.primaryTint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant={size === 'md' ? 'label' : 'heading'} color="primary">
        {initials(name)}
      </Text>
    </View>
  );
}
