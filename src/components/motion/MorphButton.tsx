import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Button, Card, Text } from '@/components/ui';

import { RadialReveal } from './RadialReveal';

export type MorphState = 'idle' | 'pending' | 'success' | 'error';

export interface MorphButtonProps {
  state: MorphState;
  /** Button label in the idle state. */
  label: string;
  onPress: () => void;
  /** Content the panel covers while not idle (callout, rows, ...). */
  children: ReactNode;
  /** Title and subtitle shown while pending. */
  pendingTitle?: string;
  pendingSubtitle?: string;
  onStop?: () => void;
  /** Rendered inside the radial reveal on success. */
  success?: ReactNode;
  /** Rendered inside the reveal on error. */
  error?: ReactNode;
  tone?: 'primary' | 'danger';
  testID?: string;
}

/**
 * The approval reference: on press the button grows upward into a full panel,
 * shows a pending title with a dashed placeholder card and a Stop control, then
 * a radial white wipe reveals the success (or error) content.
 */
export function MorphButton({
  state,
  label,
  onPress,
  children,
  pendingTitle = 'Working on it',
  pendingSubtitle,
  onStop,
  success,
  error,
  tone = 'primary',
  testID,
}: MorphButtonProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const [height, setHeight] = useState(0);
  const grow = useSharedValue(0);
  const expanded = state !== 'idle';
  const fill = tone === 'danger' ? t.colors.danger : t.colors.primary;

  useEffect(() => {
    grow.value = withTiming(
      expanded ? 1 : 0,
      reduceMotion ? t.motion.timingMicro : t.motion.timingFast,
    );
  }, [expanded, grow, reduceMotion, t.motion.timingFast, t.motion.timingMicro]);

  const edge = t.sizes.buttonHeight + t.sizes.buttonEdge;
  const panel = useAnimatedStyle(() => ({
    top: (height - edge) * (1 - grow.value),
  }));

  return (
    <View
      testID={testID}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      style={[styles.root, { gap: t.spacing.lg }]}
    >
      <View style={{ gap: t.spacing.md }}>{children}</View>
      <View style={{ height: edge }} />
      {state === 'idle' ? (
        <View style={styles.buttonSlot}>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onPress={onPress}>
            {label}
          </Button>
        </View>
      ) : null}
      {height > 0 && expanded ? (
        <Animated.View
          style={[
            styles.panel,
            panel,
            { backgroundColor: fill, borderRadius: t.radii.lg, padding: t.spacing.xl },
          ]}
        >
          {state === 'pending' ? (
            <Animated.View
              entering={FadeInUp.duration(t.motion.timingFast.duration)}
              exiting={FadeOut}
              style={[styles.center, { gap: t.spacing.lg }]}
            >
              <Text variant="title" color="onPrimary" align="center">
                {pendingTitle}
              </Text>
              {pendingSubtitle ? (
                <Text variant="body" color="onPrimary" align="center" style={{ opacity: 0.85 }}>
                  {pendingSubtitle}
                </Text>
              ) : null}
              <Card
                dashed
                elevation="flat"
                style={[
                  styles.placeholder,
                  {
                    backgroundColor: 'rgba(255,255,255,0.15)',
                    borderColor: 'rgba(255,255,255,0.6)',
                  },
                ]}
              >
                <View />
              </Card>
              {onStop ? (
                <Animated.View entering={FadeIn.delay(300)}>
                  <Button
                    variant="ghost"
                    fullWidth={false}
                    onPress={onStop}
                    accessibilityLabel="Stop"
                  >
                    Stop
                  </Button>
                </Animated.View>
              ) : null}
            </Animated.View>
          ) : null}
          <RadialReveal visible={state === 'success' || state === 'error'} color={t.colors.surface}>
            <View style={[styles.center, { padding: t.spacing.xl }]}>
              {state === 'error' ? error : success}
            </View>
          </RadialReveal>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative' },
  buttonSlot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  placeholder: { width: '80%', height: 96 },
});
