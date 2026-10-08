import { useEffect, useState } from 'react';
import { Alert, BackHandler, Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PinEntry, PinProgress, type PinBoxesState } from '@/components/lock';
import { Button, Callout, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { unlock, wipe } from '../api';
import { useLock } from '../lock.store';
import { formatCountdown, useCooldown } from '../hooks';
import { MAX_FAILURES } from '../model';
import { isLastAdminPhone } from '../storage';

/**
 * The Unlock gate (AC-2, AC-4, AC-6): rendered by the root layout as an overlay whenever the lock
 * store says `locked` or `cooling_down`, so the route underneath survives the lock (AC-3).
 */
export function UnlockScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const busy = useLock((s) => s.busy);
  const failures = useLock((s) => s.failures);
  const remaining = useCooldown();
  const [pin, setPin] = useState('');
  const [boxes, setBoxes] = useState<PinBoxesState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const cooling = remaining > 0;

  // The gate is not a screen you can leave: the hardware back button does nothing here.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const submit = (entered: string) => {
    setMessage(null);
    unlock(entered)
      .then((r) => {
        if (r.kind === 'ok') {
          setBoxes('success');
          return;
        }
        setPin('');
        if (r.kind === 'wrong_pin') {
          setBoxes('error');
          const left = MAX_FAILURES - r.failures;
          setMessage(
            left <= 5
              ? `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left before this phone wipes its keys.`
              : 'Wrong PIN.',
          );
        } else if (r.kind === 'cooling_down') {
          setBoxes('error');
          setMessage('Too many wrong PINs. Wait for the timer, then try again.');
        } else {
          setBoxes('idle');
        }
      })
      .catch((e: unknown) => {
        setPin('');
        setBoxes('error');
        setMessage(e instanceof Error ? e.message : 'Could not check the PIN.');
      });
  };

  const forgot = () => {
    void isLastAdminPhone().then((last) => {
      Alert.alert(
        'Forgot your PIN?',
        last
          ? 'This is the only approved Admin phone. Wiping it means you get back in only with your password and the 24 words of your paper recovery kit. Make sure you have the kit before you continue.'
          : 'This phone will wipe its vault keys and leave the family vault. You log in with your password again and the Admin approves this phone once more.',
        [
          { text: 'Keep trying', style: 'cancel' },
          { text: 'Wipe this phone', style: 'destructive', onPress: () => void wipe('forgot') },
        ],
      );
    });
  };

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: t.colors.canvas,
          paddingTop: insets.top + t.spacing.xxl,
          paddingBottom: insets.bottom + t.spacing.lg,
          paddingHorizontal: t.sizes.sheetInset,
          gap: t.spacing.xxl,
          alignItems: 'center',
        },
      ]}
      accessibilityViewIsModal
      testID="unlock-screen"
    >
      <Image
        source={require('../../../../assets/images/splash-icon.png')}
        accessibilityLabel="F2H bear mascot"
        style={{ width: t.sizes.hero * 0.6, height: t.sizes.hero * 0.6, borderRadius: t.radii.lg }}
      />
      <View style={{ alignItems: 'center', gap: t.spacing.xs }}>
        <Text variant="title" accessibilityRole="header">
          {cooling ? 'Locked for now' : 'Enter your PIN'}
        </Text>
        <Text variant="body" color="muted" align="center">
          {cooling
            ? `Try again in ${formatCountdown(remaining)}`
            : 'Your vault is locked. Six digits open it.'}
        </Text>
      </View>
      <PinEntry
        value={pin}
        onChange={(v) => {
          setPin(v);
          if (boxes !== 'idle') setBoxes('idle');
        }}
        onComplete={submit}
        state={boxes}
        disabled={busy || cooling}
        testID="unlock"
      />
      <PinProgress visible={busy} />
      {message ? <Callout tone="danger">{message}</Callout> : null}
      {failures > 0 && !message && !cooling ? (
        <Text variant="caption" color="muted">
          {`${MAX_FAILURES - failures} tries left`}
        </Text>
      ) : null}
      <View style={{ flex: 1 }} />
      <Button variant="ghost" onPress={forgot} disabled={busy} testID="unlock-forgot">
        Forgot your PIN?
      </Button>
    </View>
  );
}
