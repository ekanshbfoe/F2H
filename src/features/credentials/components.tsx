import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { MASK, type Category, type PresetKey } from './model';

const CATEGORY_ICON: Record<PresetKey, keyof typeof Ionicons.glyphMap> = {
  bank: 'business-outline',
  email: 'mail-outline',
  social: 'chatbubbles-outline',
  shopping: 'cart-outline',
  games: 'game-controller-outline',
  work: 'briefcase-outline',
  wifi: 'wifi-outline',
  other: 'key-outline',
};

/** A preset's own icon; a category the family named gets a tag. */
export function categoryIcon(category: Category): keyof typeof Ionicons.glyphMap {
  return CATEGORY_ICON[category as PresetKey] ?? 'pricetag-outline';
}

/**
 * Credential value rows (spec 0004, AC-4), shared by the credential detail and the read only
 * oversight screen (spec 0005, AC-4). A secret shows a fixed mask until Reveal and masks itself
 * again after 30 seconds or when `epoch` moves (the screen lost focus).
 */
export const REVEAL_MS = 30_000;

export function ValueRow({
  label,
  value,
  onCopy,
  testID,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  testID: string;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
      <View style={{ flex: 1, gap: t.spacing.xxs }}>
        <Text variant="caption" color="muted">
          {label}
        </Text>
        <Text variant="label" testID={`${testID}-value`}>
          {value}
        </Text>
      </View>
      <IconButton
        icon="copy-outline"
        label={`Copy ${label}`}
        onPress={onCopy}
        testID={`${testID}-copy`}
      />
    </View>
  );
}

/** A secret shown as 8 dots; Reveal shows it for 30 seconds or until the screen loses focus. */
export function SecretRow({
  label,
  value,
  epoch,
  onCopy,
  testID,
}: {
  label: string;
  value: string;
  epoch: number;
  onCopy: () => void;
  testID: string;
}) {
  const t = useTheme();
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = revealedAt !== null && revealedAt >= epoch;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const toggle = () => {
    if (timer.current) clearTimeout(timer.current);
    if (shown) {
      setRevealedAt(null);
      return;
    }
    setRevealedAt(epoch);
    timer.current = setTimeout(() => setRevealedAt(null), REVEAL_MS);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
      <View style={{ flex: 1, gap: t.spacing.xxs }}>
        <Text variant="caption" color="muted">
          {label}
        </Text>
        <Text
          variant="label"
          testID={`${testID}-value`}
          accessibilityLabel={shown ? undefined : `${label} hidden`}
        >
          {shown ? value : MASK}
        </Text>
      </View>
      <IconButton
        icon={shown ? 'eye-off-outline' : 'eye-outline'}
        label={shown ? `Hide ${label}` : `Reveal ${label}`}
        onPress={toggle}
        testID={`${testID}-reveal`}
      />
      <IconButton
        icon="copy-outline"
        label={`Copy ${label}`}
        onPress={onCopy}
        testID={`${testID}-copy`}
      />
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => ({
        width: t.sizes.touch,
        height: t.sizes.touch,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: t.radii.pill,
        backgroundColor: pressed ? t.colors.primaryTint : t.colors.skyTint,
      })}
    >
      <Ionicons name={icon} size={t.sizes.icon} color={t.colors.primary} />
    </Pressable>
  );
}
