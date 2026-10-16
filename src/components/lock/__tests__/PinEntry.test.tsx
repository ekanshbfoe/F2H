// covers: AC-11 (labelled keys, announced count, hidden input for hardware keyboards, hold to clear)
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { PinEntry } from '../PinEntry';

function Harness({ onComplete }: { onComplete: (pin: string) => void }) {
  const [pin, setPin] = useState('');
  return <PinEntry value={pin} onChange={setPin} onComplete={onComplete} testID="pin" />;
}

/** A finger tap: the native gesture begins, activates and ends. */
async function tap(key: string) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(`pin-key-${key}`), [
      { state: State.BEGAN },
      { state: State.ACTIVE },
      { state: State.END },
    ]);
  });
}

/** A screen reader double tap. */
async function activate(name: string) {
  await fireEvent(screen.getByRole('button', { name }), 'accessibilityAction', {
    nativeEvent: { actionName: 'activate' },
  });
}

describe('PinEntry', () => {
  it('every key has a label, counts digits aloud and completes at six', async () => {
    const onComplete = jest.fn();
    await render(<Harness onComplete={onComplete} />);
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
      expect(screen.getByRole('button', { name: d })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(screen.getByLabelText('0 of 6 digits entered')).toBeTruthy();
    await tap('4');
    await tap('8');
    expect(screen.getByLabelText('2 of 6 digits entered')).toBeTruthy();
    await tap('delete');
    expect(screen.getByLabelText('1 of 6 digits entered')).toBeTruthy();
    for (const d of ['8', '2', '9', '1', '3']) await tap(d);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('482913');
  });

  it('keeps both digits when two taps land before a render', async () => {
    const onChange = jest.fn();
    await render(<PinEntry value="" onChange={onChange} />);
    await act(async () => {
      fireGestureHandler(getByGestureTestId('pin-key-1'), [
        { state: State.BEGAN },
        { state: State.ACTIVE },
        { state: State.END },
      ]);
      fireGestureHandler(getByGestureTestId('pin-key-2'), [
        { state: State.BEGAN },
        { state: State.ACTIVE },
        { state: State.END },
      ]);
    });
    expect(onChange).toHaveBeenLastCalledWith('12');
  });

  it('a cancelled touch (finger slid off) commits nothing', async () => {
    const onChange = jest.fn();
    await render(<PinEntry value="" onChange={onChange} />);
    await act(async () => {
      fireGestureHandler(getByGestureTestId('pin-key-5'), [
        { state: State.BEGAN },
        { state: State.FAILED },
      ]);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('works with a screen reader through the activate action', async () => {
    await render(<Harness onComplete={jest.fn()} />);
    await activate('7');
    await activate('3');
    expect(screen.getByLabelText('2 of 6 digits entered')).toBeTruthy();
    await activate('Delete');
    expect(screen.getByLabelText('1 of 6 digits entered')).toBeTruthy();
  });

  it('a long press on delete clears every digit', async () => {
    await render(<Harness onComplete={jest.fn()} />);
    for (const d of ['1', '2', '3']) await tap(d);
    expect(screen.getByLabelText('3 of 6 digits entered')).toBeTruthy();
    await act(async () => {
      fireGestureHandler(getByGestureTestId('pin-key-clear'), [
        { state: State.BEGAN },
        { state: State.ACTIVE },
        { state: State.END },
      ]);
    });
    expect(screen.getByLabelText('0 of 6 digits entered')).toBeTruthy();
  });

  it('pauses input once six digits are submitted, until the parent clears them', async () => {
    const onComplete = jest.fn();
    function Clearing() {
      const [pin, setPin] = useState('');
      return (
        <>
          <PinEntry value={pin} onChange={setPin} onComplete={onComplete} testID="pin" />
          <Text accessibilityRole="button" onPress={() => setPin('')}>
            reset
          </Text>
        </>
      );
    }
    await render(<Clearing />);
    for (const d of ['1', '2', '3', '4', '5', '6']) await tap(d);
    expect(onComplete).toHaveBeenCalledTimes(1);
    await tap('delete');
    await tap('9');
    expect(screen.getByLabelText('6 of 6 digits entered')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'reset' }));
    await tap('7');
    expect(screen.getByLabelText('1 of 6 digits entered')).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('accepts digits from a hardware keyboard through the hidden input and drops the rest', async () => {
    const onComplete = jest.fn();
    await render(<Harness onComplete={onComplete} />);
    await fireEvent.changeText(screen.getByTestId('pin-input'), '12a3');
    expect(screen.getByLabelText('3 of 6 digits entered')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('pin-input'), '1234567');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('shows progress while busy, otherwise the status line, in one fixed slot', async () => {
    const { rerender } = await render(
      <PinEntry value="" onChange={jest.fn()} fill busy busyLabel="Saving your PIN" />,
    );
    expect(screen.getByText('Saving your PIN')).toBeTruthy();
    await rerender(
      <PinEntry
        value=""
        onChange={jest.fn()}
        fill
        status={{ tone: 'muted', text: '7 tries left' }}
      />,
    );
    expect(screen.queryByText('Saving your PIN')).toBeNull();
    expect(screen.getByText('7 tries left')).toBeTruthy();
    await rerender(
      <PinEntry
        value=""
        onChange={jest.fn()}
        fill
        status={{ tone: 'danger', text: 'The two PINs do not match. Start again.' }}
      />,
    );
    expect(screen.getByText('The two PINs do not match. Start again.')).toBeTruthy();
  });

  it('shows the check and rests the pad from the frame the sixth digit lands', async () => {
    const onChange = jest.fn();
    const { rerender } = await render(
      <PinEntry value="123456" onChange={onChange} onComplete={jest.fn()} fill />,
    );
    expect(screen.getByText('Checking your PIN')).toBeTruthy();
    await activate('1');
    expect(onChange).not.toHaveBeenCalled();
    // a step that only records the digits never shows a check
    await rerender(
      <PinEntry value="123456" onChange={jest.fn()} onComplete={jest.fn()} awaitsCheck={false} />,
    );
    expect(screen.queryByText('Checking your PIN')).toBeNull();
  });

  it('draws a corner action in the empty pad cell', async () => {
    await render(<PinEntry value="" onChange={jest.fn()} padCorner={<Text>Forgot?</Text>} />);
    expect(screen.getByText('Forgot?')).toBeTruthy();
  });

  it('ignores taps and screen reader actions while disabled', async () => {
    const onChange = jest.fn();
    await render(<PinEntry value="" onChange={onChange} disabled />);
    await activate('1');
    expect(onChange).not.toHaveBeenCalled();
  });
});
