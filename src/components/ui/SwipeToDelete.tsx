import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { Pressable, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Text } from './Text';
import { useTheme } from '@/theme';

/** Width of the red delete panel the row slides off. */
const ACTION_WIDTH = 96;

/**
 * A row that slides left to show a red delete panel. Letting go past the panel's middle asks
 * `onDelete`, which gets a `close` to slide the row back if the person keeps the file.
 */
export function SwipeToDelete({
  onDelete,
  enabled = true,
  label,
  children,
  testID,
}: {
  onDelete: (close: () => void) => void;
  enabled?: boolean;
  /** Read by screen readers for the delete panel. */
  label: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  const close = () => ref.current?.close();
  const ask = () => onDelete(close);

  return (
    <Swipeable
      ref={ref}
      enabled={enabled}
      friction={1.6}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
      dragOffsetFromRightEdge={t.spacing.md}
      onSwipeableWillOpen={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onSwipeableOpen={ask}
      renderRightActions={(progress) => (
        <DeletePanel progress={progress} onPress={ask} label={label} testID={testID} />
      )}
    >
      {children}
    </Swipeable>
  );
}

function DeletePanel({
  progress,
  onPress,
  label,
  testID,
}: {
  progress: SharedValue<number>;
  onPress: () => void;
  label: string;
  testID?: string;
}) {
  const t = useTheme();
  // the icon grows in as the row slides away, so the panel reads as uncovered, not pasted on
  const icon = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, 0.6, 1], [0, 0.6, 1], 'clamp'),
    transform: [{ scale: interpolate(progress.get(), [0, 1], [0.7, 1], 'clamp') }],
  }));
  return (
    <View style={{ width: ACTION_WIDTH, paddingLeft: t.spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => ({
          flex: 1,
          borderRadius: t.radii.lg,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? t.colors.dangerDark : t.colors.danger,
        })}
      >
        <Animated.View style={[{ alignItems: 'center', gap: t.spacing.xxs }, icon]}>
          <Ionicons name="trash-outline" size={t.sizes.iconLg} color={t.colors.onPrimary} />
          <Text variant="caption" color="onPrimary">
            Delete
          </Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}
