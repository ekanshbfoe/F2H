import { useEffect, useState } from 'react';
import { Alert, BackHandler, Image, useWindowDimensions, View } from 'react-native';

import { PinScreen, type PinBoxesState } from '@/components/lock';
import { Button } from '@/components/ui';
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
  const { height } = useWindowDimensions();
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

  // on a short phone the mascot steps aside so the pad keeps its full size keys
  const tall = height >= t.sizes.compactHeight;
  return (
    <PinScreen
      overlay
      testID="unlock-screen"
      title={cooling ? 'Locked for now' : 'Enter your PIN'}
      subtitle={
        cooling
          ? `Try again in ${formatCountdown(remaining)}`
          : 'Your vault is locked. Six digits open it.'
      }
      compactSubtitle={
        cooling ? `Try again in ${formatCountdown(remaining)}` : 'Six digits open your vault.'
      }
      accessory={
        tall ? (
          <View
            style={[
              t.shadows.raised,
              {
                padding: t.spacing.xs,
                borderRadius: t.radii.xl,
                backgroundColor: t.colors.surface,
              },
            ]}
          >
            <Image
              source={require('../../../../assets/images/splash-icon.png')}
              accessibilityLabel="F2H bear mascot"
              style={{
                width: t.sizes.hero * 0.5,
                height: t.sizes.hero * 0.5,
                borderRadius: t.radii.lg,
              }}
            />
          </View>
        ) : null
      }
      entry={{
        value: pin,
        onChange: (v) => {
          setPin(v);
          if (boxes !== 'idle') setBoxes('idle');
        },
        onComplete: submit,
        state: boxes,
        disabled: busy || cooling,
        busy,
        status: message
          ? { tone: 'danger', text: message }
          : failures > 0 && !cooling
            ? { tone: 'muted', text: `${MAX_FAILURES - failures} tries left` }
            : null,
        testID: 'unlock',
      }}
      footer={
        <Button
          variant="ghost"
          size={tall ? 'md' : 'sm'}
          fullWidth={tall}
          onPress={forgot}
          disabled={busy}
          testID="unlock-forgot"
        >
          Forgot your PIN?
        </Button>
      }
    />
  );
}
