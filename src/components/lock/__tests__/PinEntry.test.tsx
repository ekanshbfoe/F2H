// covers: AC-11 (labelled keys, announced count, hidden input for hardware keyboards)
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { PinEntry } from '../PinEntry';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => undefined) }));

function Harness({ onComplete }: { onComplete: (pin: string) => void }) {
  const [pin, setPin] = useState('');
  return <PinEntry value={pin} onChange={setPin} onComplete={onComplete} testID="pin" />;
}

describe('PinEntry', () => {
  it('every key has a label, counts digits aloud and completes at six', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();
    await render(<Harness onComplete={onComplete} />);
    for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) {
      expect(screen.getByRole('button', { name: d })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(screen.getByLabelText('0 of 6 digits entered')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: '4' }));
    await user.press(screen.getByRole('button', { name: '8' }));
    expect(screen.getByLabelText('2 of 6 digits entered')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByLabelText('1 of 6 digits entered')).toBeTruthy();
    for (const d of ['8', '2', '9', '1', '3']) {
      await user.press(screen.getByRole('button', { name: d }));
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('482913');
  });

  it('accepts digits from a hardware keyboard through the hidden input and drops the rest', async () => {
    const onComplete = jest.fn();
    await render(<Harness onComplete={onComplete} />);
    await fireEvent.changeText(screen.getByTestId('pin-input'), '12a3');
    expect(screen.getByLabelText('3 of 6 digits entered')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('pin-input'), '1234567');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('ignores taps while disabled', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await render(<PinEntry value="" onChange={onChange} disabled />);
    await user.press(screen.getByRole('button', { name: '1' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
