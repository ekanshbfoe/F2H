import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useRiseIn } from '@/components/motion';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

export interface WordGridProps {
  words: string[];
  /** Cascade the tiles in, row by row (the kit is shown rarely, so it may take its moment). */
  reveal?: boolean;
  testID?: string;
}

/**
 * The kit as paper tiles: each word sits on a white tile lifted off the card by a darker lip,
 * numbered, two to a row in reading order, so copying it onto paper is easy to follow.
 */
export function WordGrid({ words, reveal = true, testID }: WordGridProps) {
  const t = useTheme();
  const rows: string[][] = [];
  for (let i = 0; i < words.length; i += 2) rows.push(words.slice(i, i + 2));
  const step = t.motion.enterStepMs / 2;
  const riseIn = useRiseIn();
  return (
    <View style={{ gap: t.spacing.sm }} testID={testID}>
      {rows.map((row, r) => (
        <Animated.View
          key={r}
          entering={reveal ? riseIn(r * step) : undefined}
          style={{ flexDirection: 'row', gap: t.spacing.sm }}
        >
          {row.map((word, c) => {
            const n = r * 2 + c + 1;
            return (
              <View
                key={`${n}-${word}`}
                style={styles.tile}
                accessible
                accessibilityLabel={`word ${n}: ${word}`}
              >
                <View
                  style={[
                    styles.lip,
                    {
                      top: t.sizes.border,
                      borderRadius: t.radii.md,
                      backgroundColor: t.colors.lineStrong,
                    },
                  ]}
                />
                <View
                  style={{
                    marginBottom: t.sizes.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing.sm,
                    paddingVertical: t.spacing.sm,
                    paddingHorizontal: t.spacing.sm,
                    borderRadius: t.radii.md,
                    borderWidth: t.sizes.hairline,
                    borderColor: t.colors.line,
                    backgroundColor: t.colors.surface,
                  }}
                >
                  <Text variant="caption" color="primary" style={{ minWidth: t.spacing.xl }}>
                    {String(n).padStart(2, '0')}
                  </Text>
                  {/* an 8 letter word fits a 320 dp phone: it shrinks a little, never wraps */}
                  <Text
                    variant="label"
                    color="ink"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{ flexShrink: 1 }}
                  >
                    {word}
                  </Text>
                </View>
              </View>
            );
          })}
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1 },
  lip: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
