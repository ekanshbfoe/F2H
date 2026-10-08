import { useRouter } from 'expo-router';
import { useState } from 'react';

import { PinEntry, PinProgress, type PinBoxesState } from '@/components/lock';
import { Badge, Button, Callout, Card, Screen } from '@/components/ui';

import { LockError, rewrapPin, verifyPin } from '../api';
import { useLock } from '../lock.store';
import { describePinProblem, pinProblem } from '../model';

type Step = 'current' | 'new' | 'confirm' | 'done';

/** Change PIN (AC-7): the current PIN through the attempt gate, then the new one twice. */
export function ChangePinScreen() {
  const router = useRouter();
  const busy = useLock((s) => s.busy);
  const [step, setStep] = useState<Step>('current');
  const [first, setFirst] = useState('');
  const [pin, setPin] = useState('');
  const [boxes, setBoxes] = useState<PinBoxesState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fail = (why: string | null, back: Step) => {
    setBoxes('error');
    setMessage(why);
    setPin('');
    setStep(back);
  };

  const complete = (entered: string) => {
    setMessage(null);
    if (step === 'current') {
      verifyPin(entered)
        .then((r) => {
          if (r.kind === 'ok') {
            setPin('');
            setBoxes('idle');
            setStep('new');
          } else if (r.kind === 'wrong_pin') {
            fail('That is not your current PIN.', 'current');
          } else {
            // cooling down or wiped: the lock gate takes over this screen
            fail(null, 'current');
          }
        })
        .catch((e: unknown) =>
          fail(e instanceof Error ? e.message : 'Could not check the PIN.', 'current'),
        );
      return;
    }
    if (step === 'new') {
      const problem = pinProblem(entered);
      if (problem) {
        fail(describePinProblem(problem), 'new');
        return;
      }
      setFirst(entered);
      setPin('');
      setBoxes('idle');
      setStep('confirm');
      return;
    }
    if (entered !== first) {
      setFirst('');
      fail('The two PINs do not match. Choose the new PIN again.', 'new');
      return;
    }
    setSaving(true);
    rewrapPin(entered)
      .then(() => {
        setBoxes('success');
        setStep('done');
      })
      .catch((e: unknown) => {
        setFirst('');
        fail(
          e instanceof LockError && e.problem
            ? describePinProblem(e.problem)
            : 'Could not save the new PIN. Try again.',
          'new',
        );
      })
      .finally(() => setSaving(false));
  };

  const copy: Record<Step, [string, string]> = {
    current: ['Current PIN', 'Enter the PIN you use today.'],
    new: ['New PIN', 'Six digits, not all the same and not a straight run.'],
    confirm: ['Confirm the new PIN', 'Type the new six digits once more.'],
    done: ['PIN changed', 'The old PIN stopped working just now.'],
  };

  return (
    <Screen
      title={copy[step][0]}
      subtitle={copy[step][1]}
      footer={step === 'done' ? <Button onPress={() => router.back()}>Done</Button> : undefined}
    >
      {step === 'done' ? (
        <Card style={{ gap: 8 }}>
          <Badge tone="success">New PIN saved</Badge>
          <Callout>Use the new PIN the next time this phone locks.</Callout>
        </Card>
      ) : (
        <>
          <PinEntry
            value={pin}
            onChange={(v) => {
              setPin(v);
              if (boxes !== 'idle') setBoxes('idle');
            }}
            onComplete={complete}
            state={boxes}
            disabled={busy || saving}
            testID="change-pin"
          />
          <PinProgress visible={busy || saving} label={saving ? 'Saving your PIN' : undefined} />
          {message ? <Callout tone="danger">{message}</Callout> : null}
        </>
      )}
    </Screen>
  );
}
