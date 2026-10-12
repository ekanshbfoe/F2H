import { useRouter } from 'expo-router';
import { useState } from 'react';

import { PinScreen, type PinBoxesState } from '@/components/lock';
import { Badge, Button, Callout, Card, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

import { LockError, rewrapPin, verifyPin } from '../api';
import { useLock } from '../lock.store';
import { describePinProblem, pinProblem } from '../model';

type Step = 'current' | 'new' | 'confirm' | 'done';

/** Change PIN (AC-7): the current PIN through the attempt gate, then the new one twice. */
export function ChangePinScreen() {
  const router = useRouter();
  const t = useTheme();
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

  const short: Record<Step, string> = {
    current: 'The PIN you use today.',
    new: 'Not all the same, not a run.',
    confirm: 'Same six digits once more.',
    done: '',
  };
  const copy: Record<Step, [string, string]> = {
    current: ['Current PIN', 'Enter the PIN you use today.'],
    new: ['New PIN', 'Six digits, not all the same and not a straight run.'],
    confirm: ['Confirm the new PIN', 'Type the new six digits once more.'],
    done: ['PIN changed', 'The old PIN stopped working just now.'],
  };

  if (step === 'done') {
    return (
      <Screen
        title={copy.done[0]}
        subtitle={copy.done[1]}
        footer={<Button onPress={() => router.back()}>Done</Button>}
      >
        <Card style={{ gap: t.spacing.sm }}>
          <Badge tone="success">New PIN saved</Badge>
          <Callout>Use the new PIN the next time this phone locks.</Callout>
        </Card>
      </Screen>
    );
  }

  const order: Step[] = ['current', 'new', 'confirm'];
  return (
    <PinScreen
      title={copy[step][0]}
      subtitle={copy[step][1]}
      compactSubtitle={short[step]}
      steps={{ count: 3, current: order.indexOf(step) }}
      direction={boxes === 'error' ? 'back' : 'forward'}
      entry={{
        value: pin,
        onChange: (v) => {
          setPin(v);
          if (boxes !== 'idle') setBoxes('idle');
        },
        onComplete: complete,
        state: boxes,
        disabled: busy || saving,
        busy: busy || saving,
        busyLabel: saving ? 'Saving your PIN' : undefined,
        status: message ? { tone: 'danger', text: message } : null,
        testID: 'change-pin',
      }}
    />
  );
}
