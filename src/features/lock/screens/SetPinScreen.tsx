import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useWindowDimensions } from 'react-native';

import { PinScreen, type PinBoxesState } from '@/components/lock';
import { Text } from '@/components/ui';
import { pathFor } from '@/features/auth/routes';
import { useSession } from '@/state/session.store';
import { useTheme } from '@/theme';

import { LockError, setPin } from '../api';
import { describePinProblem, pinProblem } from '../model';

/** Set PIN (AC-1, AC-15): six digits twice; a mismatch shakes, clears and starts over. */
export function SetPinScreen() {
  const router = useRouter();
  const t = useTheme();
  const compact = useWindowDimensions().height < t.sizes.compactHeight;
  const hasKey = useSession((s) => s.mk !== null);
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [first, setFirst] = useState('');
  const [pin, setPinValue] = useState('');
  const [boxes, setBoxes] = useState<PinBoxesState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!hasKey) {
    // Nothing to wrap: the session did not survive. Back to login.
    router.replace(pathFor('login'));
    return null;
  }

  const restart = (why: string | null) => {
    setBoxes('error');
    setMessage(why);
    setPinValue('');
    setFirst('');
    setStep('enter');
  };

  const complete = (entered: string) => {
    if (step === 'enter') {
      const problem = pinProblem(entered);
      if (problem) {
        restart(describePinProblem(problem));
        return;
      }
      setFirst(entered);
      setPinValue('');
      setMessage(null);
      setBoxes('idle');
      setStep('confirm');
      return;
    }
    if (entered !== first) {
      restart('The two PINs do not match. Start again.');
      return;
    }
    setBusy(true);
    setMessage(null);
    setPin(entered)
      // the boxes play their success sequence, then onSuccessDone opens the vault
      .then(() => setBoxes('success'))
      .catch((e: unknown) => {
        setBusy(false);
        restart(
          e instanceof LockError && e.problem
            ? describePinProblem(e.problem)
            : 'Could not save the PIN. Try again.',
        );
      });
  };

  return (
    <PinScreen
      headline="Lock this phone with a PIN"
      compactHeadline="Set a PIN"
      title={step === 'enter' ? 'Choose a PIN' : 'Confirm your PIN'}
      subtitle={
        step === 'enter'
          ? 'Pick six digits only you would guess. They open your vault here.'
          : 'Type the same six digits once more.'
      }
      compactSubtitle={
        step === 'enter' ? "Six digits only you'd guess." : 'Same six digits once more.'
      }
      steps={{ count: 2, current: step === 'enter' ? 0 : 1 }}
      direction={step === 'enter' && boxes === 'error' ? 'back' : 'forward'}
      entry={{
        value: pin,
        onChange: (v) => {
          setPinValue(v);
          if (boxes !== 'idle') setBoxes('idle');
        },
        onComplete: complete,
        onSuccessDone: () => router.replace(pathFor('home')),
        awaitsCheck: step === 'confirm',
        state: boxes,
        busy: busy && boxes !== 'success',
        busyLabel: 'Saving your PIN',
        status: message ? { tone: 'danger', text: message } : null,
        testID: 'set-pin',
      }}
      footer={
        compact ? undefined : (
          <Text variant="caption" color="muted" align="center">
            Ten wrong PINs in a row wipe this phone&apos;s keys. The Admin can approve it again.
          </Text>
        )
      }
    />
  );
}
