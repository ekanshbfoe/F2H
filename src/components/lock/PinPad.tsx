import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

export interface PinPadProps {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
  testID?: string;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'delete'],
] as const;

function tap() {
  Haptics.selectionAsync().catch(() => undefined);
}

/** Numeric pad with labelled 44 pt or larger keys (AC-11). The reference has none; this is F2H's own. */
export function PinPad({ onDigit, onDelete, disabled = false, testID }: PinPadProps) {
  const t = useTheme();
  const key = Math.max(t.sizes.touch, t.sizes.pinBoxLg + t.spacing.sm);
  return (
    <View testID={testID} style={{ gap: t.spacing.md, alignSelf: 'center' }}>
      {ROWS.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: t.spacing.lg }}>
          {row.map((k, c) => {
            if (k === '') return <View key={c} style={{ width: key, height: key }} />;
            const isDelete = k === 'delete';
            return (
              <Pressable
                key={c}
                accessibilityRole="button"
                accessibilityLabel={isDelete ? 'Delete' : k}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => {
                  tap();
                  if (isDelete) onDelete();
                  else onDigit(k);
                }}
                style={({ pressed }) => [
                  styles.key,
                  {
                    width: key,
                    height: key,
                    borderRadius: t.radii.pill,
                    backgroundColor: pressed ? t.colors.primaryTint : t.colors.surface,
                    borderColor: t.colors.line,
                    borderWidth: t.sizes.hairline,
                    opacity: disabled ? t.opacity.disabled : 1,
                  },
                  pressed ? { transform: [{ scale: t.motion.pressScale }] } : null,
                ]}
              >
                {isDelete ? (
                  <Ionicons name="backspace-outline" size={t.sizes.iconLg} color={t.colors.ink} />
                ) : (
                  <Text variant="pin">{k}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  key: { alignItems: 'center', justifyContent: 'center' },
});
