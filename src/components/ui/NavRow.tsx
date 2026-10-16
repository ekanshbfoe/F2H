import { Ionicons } from '@expo/vector-icons';
import { Children, Fragment, isValidElement, type ComponentProps, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

type IconName = ComponentProps<typeof Ionicons>['name'];
export type NavRowTone = 'primary' | 'sky' | 'success' | 'warning' | 'danger';

export interface NavRowProps {
  icon: IconName;
  title: string;
  /** One quiet line under the title. */
  subtitle?: string;
  tone?: NavRowTone;
  /** Drawn before the chevron (a count, a badge). */
  trailing?: ReactNode;
  onPress?: () => void;
  /** A destructive row: red title, no chevron. */
  destructive?: boolean;
  testID?: string;
}

/**
 * One row of a settings style group: a tinted icon tile, the title with a quiet line under it,
 * and a chevron. Title and subtitle stack, so a long word never breaks letter by letter.
 * Pressing highlights the row's background (a full width row never scales).
 */
export function NavRow({
  icon,
  title,
  subtitle,
  tone = 'primary',
  trailing,
  onPress,
  destructive = false,
  testID,
}: NavRowProps) {
  const t = useTheme();
  const palette = {
    primary: { face: t.colors.primaryTint, ink: t.colors.primary },
    sky: { face: t.colors.skyTint, ink: t.colors.sky },
    success: { face: t.colors.successTint, ink: t.colors.success },
    warning: { face: t.colors.warningTint, ink: t.colors.warning },
    danger: { face: t.colors.dangerTint, ink: t.colors.danger },
  }[destructive ? 'danger' : tone];
  const tile = t.sizes.touch - t.spacing.xs;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.md,
        minHeight: t.sizes.buttonHeight + t.spacing.sm,
        paddingHorizontal: t.spacing.lg,
        paddingVertical: t.spacing.sm,
        backgroundColor: pressed ? t.colors.canvas : t.colors.surface,
      })}
    >
      <View
        style={{
          width: tile,
          height: tile,
          borderRadius: t.radii.md,
          backgroundColor: palette.face,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={t.sizes.icon} color={palette.ink} />
      </View>
      <View style={{ flex: 1, gap: t.spacing.xxs }}>
        <Text variant="label" color={destructive ? 'danger' : 'ink'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {destructive ? null : (
        <Ionicons name="chevron-forward" size={t.sizes.icon} color={t.colors.lineStrong} />
      )}
    </Pressable>
  );
}

export interface NavGroupProps {
  /** A small heading over the group. */
  title?: string;
  children: ReactNode;
  testID?: string;
}

/** Rows on one raised card, split by hairlines that start after the icon tiles. */
export function NavGroup({ title, children, testID }: NavGroupProps) {
  const t = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  const indent = t.spacing.lg + t.sizes.touch - t.spacing.xs + t.spacing.md;
  return (
    <View style={{ gap: t.spacing.sm }} testID={testID}>
      {title ? (
        <Text
          variant="caption"
          color="muted"
          accessibilityRole="header"
          style={{ paddingHorizontal: t.spacing.xs }}
        >
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View
        style={[t.shadows.raised, { borderRadius: t.radii.xl, backgroundColor: t.colors.surface }]}
      >
        <View style={{ borderRadius: t.radii.xl, overflow: 'hidden' }}>
          {rows.map((row, i) => (
            <Fragment key={row.key ?? i}>
              {i > 0 ? (
                <View
                  style={{
                    height: t.sizes.hairline,
                    marginLeft: indent,
                    backgroundColor: t.colors.line,
                  }}
                />
              ) : null}
              {row}
            </Fragment>
          ))}
        </View>
      </View>
    </View>
  );
}
