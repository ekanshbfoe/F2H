import { useRouter } from 'expo-router';
import { useState } from 'react';

import { PinEntry, PinProgress, type PinBoxesState } from '@/components/lock';
import { Callout, Screen, Text } from '@/components/ui';
import { pathFor } from '@/features/auth/routes';
import { useSession } from '@/state/session.store';

import { LockError, setPin } from '../api';
import { describePinProblem, pinProblem } from '../model';

/** Set PIN (AC-1, AC-15): six digits twice; a mismatch shakes, clears and starts over. */
export function SetPinScreen() {
  const router = useRouter();
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
      .then(() => {
        setBoxes('success');
        router.replace(pathFor('home'));
      })
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
    <Screen
      title={step === 'enter' ? 'Choose a PIN' : 'Confirm your PIN'}
      subtitle={
        step === 'enter'
          ? 'Six digits open your vault on this phone from now on. Pick something only you would guess.'
          : 'Type the same six digits once more.'
      }
    >
      <PinEntry
        value={pin}
        onChange={(v) => {
          setPinValue(v);
          if (boxes !== 'idle') setBoxes('idle');
        }}
        onComplete={complete}
        state={boxes}
        disabled={busy}
        testID="set-pin"
      />
      <PinProgress visible={busy} label="Saving your PIN" />
      {message ? <Callout tone="danger">{message}</Callout> : null}
      <Text variant="caption" color="muted" align="center">
        Ten wrong PINs in a row wipe this phone&apos;s keys. The Admin can approve it again.
      </Text>
    </Screen>
  );
}
