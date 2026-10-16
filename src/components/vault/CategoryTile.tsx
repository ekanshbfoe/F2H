import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
export type CategoryTone = 'primary' | 'sky' | 'warning' | 'success';

export interface CategoryTileProps {
  icon: IconName;
  title: string;
  /** The count, or a hint before the list has loaded. */
  detail: string;
  tone?: CategoryTone;
  /** Lay out icon and text side by side (a tile spanning the whole row). */
  wide?: boolean;
  onPress: () => void;
  testID?: string;
}

/**
 * A vault category as a physical tile: a white face resting on a darker lip, the same object
 * as the PIN keys. On touch down the face sinks onto the lip and comes back up on release.
 * New categories are new tiles; the grid takes them two to a row.
 */
export function CategoryTile({
  icon,
  title,
  detail,
  tone = 'primary',
  wide = false,
  onPress,
  testID,
}: CategoryTileProps) {
  const t = useTheme();
  const edge = t.sizes.buttonEdge;
  const palette = {
    primary: { face: t.colors.primaryTint, ink: t.colors.primary },
    sky: { face: t.colors.skyTint, ink: t.colors.sky },
    warning: { face: t.colors.warningTint, ink: t.colors.warning },
    success: { face: t.colors.successTint, ink: t.colors.success },
  }[tone];
  const medal = t.sizes.touch + t.spacing.xs;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${detail}`}
      onPress={onPress}
      testID={testID}
      style={{ flex: 1, paddingBottom: edge }}
    >
      {({ pressed }) => (
        <>
          {/* the lip, on its own layer so Android elevation never lifts it over the face */}
          <View collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
            <View
              style={[
                StyleSheet.absoluteFill,
                t.shadows.raised,
                { top: edge, borderRadius: t.radii.xl, backgroundColor: t.colors.lineStrong },
              ]}
            />
          </View>
          <Animated.View
            style={{
              flexDirection: wide ? 'row' : 'column',
              alignItems: wide ? 'center' : 'flex-start',
              gap: wide ? t.spacing.lg : t.spacing.md,
              padding: t.spacing.lg,
              minHeight: wide ? undefined : t.sizes.hero + t.spacing.lg,
              borderRadius: t.radii.xl,
              backgroundColor: pressed ? t.colors.canvas : t.colors.surface,
              borderWidth: t.sizes.hairline,
              borderColor: t.colors.line,
              transform: [{ translateY: pressed ? edge : 0 }],
              transitionProperty: ['transform', 'backgroundColor'],
              transitionDuration: pressed ? t.motion.timingPressIn.duration : t.motion.glideMs,
              transitionTimingFunction: t.motion.cssEaseOut,
            }}
          >
            <View
              style={{
                width: medal,
                height: medal,
                borderRadius: t.radii.lg,
                backgroundColor: palette.face,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={icon} size={t.sizes.iconLg} color={palette.ink} />
            </View>
            <View style={{ flex: wide ? 1 : undefined, gap: t.spacing.xxs }}>
              <Text variant="heading" numberOfLines={1}>
                {title}
              </Text>
              <Text variant="caption" color="muted" numberOfLines={1}>
                {detail}
              </Text>
            </View>
            {wide ? (
              <Ionicons name="chevron-forward" size={t.sizes.icon} color={t.colors.lineStrong} />
            ) : null}
          </Animated.View>
        </>
      )}
    </Pressable>
  );
}
