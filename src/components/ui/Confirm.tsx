import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { create } from 'zustand';

import { useTheme } from '@/theme';

import { Button } from './Button';
import { Medallion, type MedallionProps } from './Medallion';
import { Text } from './Text';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  icon?: MedallionProps['icon'];
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
}

const useConfirmStore = create<ConfirmState>(() => ({ request: null }));

/**
 * Asks a yes or no question in the app's own card (not the system alert) and resolves true when
 * the person confirms. `ConfirmHost` must be mounted once near the root. A second question
 * while one is open answers the first with false.
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.getState().request?.resolve(false);
    useConfirmStore.setState({ request: { ...options, resolve } });
  });
}

/** Answers any open question with false, for a lock or sign out. */
export function dismissConfirm(): void {
  const open = useConfirmStore.getState().request;
  if (!open) return;
  useConfirmStore.setState({ request: null });
  open.resolve(false);
}

/** How much smaller the card starts before it settles in. */
const CARD_SEED = 0.96;

/** The one place `confirm` questions appear: a raised card over a dimmed screen. */
export function ConfirmHost() {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const request = useConfirmStore((s) => s.request);
  // keep the last question on screen while the card fades away
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);
  const p = useSharedValue(0);

  useEffect(() => {
    if (request) {
      p.set(withTiming(1, t.motion.timingFast));
    } else if (shown) {
      p.set(
        withTiming(0, { duration: t.motion.transitionMs }, (done) => {
          if (done) scheduleOnRN(setShown, null);
        }),
      );
    }
  }, [request, shown, p, t.motion.timingFast, t.motion.transitionMs]);

  const scrim = useAnimatedStyle(() => ({ opacity: p.get() }));
  const card = useAnimatedStyle(() => ({
    opacity: p.get(),
    transform: [{ scale: reduceMotion ? 1 : CARD_SEED + (1 - CARD_SEED) * p.get() }],
  }));

  if (!shown) return null;

  const answer = (ok: boolean) => {
    const open = useConfirmStore.getState().request;
    if (!open) return;
    useConfirmStore.setState({ request: null });
    open.resolve(ok);
  };
  const tone = shown.tone ?? 'danger';

  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      animationType="none"
      onRequestClose={() => answer(false)}
    >
      <View style={styles.root}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.scrim }, scrim]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => answer(false)}
            accessibilityRole="button"
            accessibilityLabel={shown.cancelLabel ?? 'Keep'}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            card,
            t.shadows.floating,
            {
              marginHorizontal: t.sizes.sheetInset,
              padding: t.spacing.xl,
              gap: t.spacing.md,
              borderRadius: t.radii.xxl,
              backgroundColor: t.colors.surface,
              alignItems: 'center',
            },
          ]}
          testID="confirm"
        >
          <Medallion
            icon={shown.icon ?? (tone === 'danger' ? 'trash-outline' : 'help')}
            tone={tone}
            size={t.sizes.hero / 2}
          />
          <Text variant="heading" align="center" accessibilityRole="header">
            {shown.title}
          </Text>
          <Text variant="body" color="muted" align="center">
            {shown.message}
          </Text>
          <View style={[styles.buttons, { gap: t.spacing.sm, marginTop: t.spacing.sm }]}>
            <View style={styles.fill}>
              <Button variant="secondary" onPress={() => answer(false)} testID="confirm-cancel">
                {shown.cancelLabel ?? 'Keep'}
              </Button>
            </View>
            <View style={styles.fill}>
              <Button
                variant={tone === 'danger' ? 'danger' : 'primary'}
                onPress={() => answer(true)}
                testID="confirm-accept"
              >
                {shown.confirmLabel ?? 'Delete'}
              </Button>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center' },
  buttons: { flexDirection: 'row', alignSelf: 'stretch' },
  fill: { flex: 1 },
});
