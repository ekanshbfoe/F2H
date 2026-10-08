// covers: AC-3 of spec 0001-admin-device-self-approval (24 boxes, suggestions, line paste, hygiene)
import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { renderWithProviders } from '@/lib/test-utils';

import { MNEMONIC_WORDS, MnemonicEntry } from '../MnemonicEntry';

const mockGet = jest.fn(async () => '');
const mockSet = jest.fn(async (_s: string) => true);
jest.mock('expo-clipboard', () => ({
  getStringAsync: () => mockGet(),
  setStringAsync: (s: string) => mockSet(s),
}));

const LIST = ['abandon', 'ability', 'able', 'about', 'above', 'absent', 'zoo'];
const suggest = (p: string) => LIST.filter((w) => w.startsWith(p.toLowerCase())).slice(0, 4);
const isWord = (w: string) => LIST.includes(w);
const line = Array.from({ length: MNEMONIC_WORDS }, (_, i) => LIST[i % LIST.length] ?? 'zoo');

function Harness({ onWords }: { onWords?: (w: string[]) => void }) {
  const [words, setWords] = useState<string[]>(Array.from({ length: MNEMONIC_WORDS }, () => ''));
  return (
    <MnemonicEntry
      value={words}
      onChange={(w) => {
        setWords(w);
        onWords?.(w);
      }}
      suggest={suggest}
      isWord={isWord}
    />
  );
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue('');
  mockSet.mockClear();
});

describe('MnemonicEntry', () => {
  it('renders 24 labelled boxes with the hygiene props', async () => {
    await renderWithProviders(<Harness />);
    expect(screen.getByLabelText('Word 1 of 24')).toBeOnTheScreen();
    expect(screen.getByLabelText('Word 24 of 24')).toBeOnTheScreen();
    const first = screen.getByTestId('mnemonic-word-1');
    expect(first.props.autoCorrect).toBe(false);
    expect(first.props.autoCapitalize).toBe('none');
    expect(first.props.autoComplete).toBe('off');
    expect(first.props.importantForAutofill).toBe('no');
    expect(first.props.keyboardType).toBe('visible-password');
  });

  it('suggests words for the focused box and a tap fills it', async () => {
    const user = userEvent.setup();
    const onWords = jest.fn();
    await renderWithProviders(<Harness onWords={onWords} />);
    const box = screen.getByTestId('mnemonic-word-3');
    await fireEvent(box, 'focus');
    await fireEvent.changeText(box, 'ab');
    expect(screen.getByTestId('mnemonic-suggestions')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Use about for word 3' }));
    expect(onWords).toHaveBeenLastCalledWith(expect.arrayContaining(['about']));
    expect(screen.getByTestId('mnemonic-word-3').props.value).toBe('about');
  });

  it('says when nothing in the list starts like the typed letters', async () => {
    await renderWithProviders(<Harness />);
    const box = screen.getByTestId('mnemonic-word-1');
    await fireEvent(box, 'focus');
    await fireEvent.changeText(box, 'qq');
    expect(screen.getByText('No kit word starts like that.')).toBeOnTheScreen();
  });

  it('fills all 24 from a line pasted into one box and clears the clipboard', async () => {
    const onWords = jest.fn();
    await renderWithProviders(<Harness onWords={onWords} />);
    await fireEvent.changeText(screen.getByTestId('mnemonic-word-5'), line.join('  ') + '\n');
    expect(onWords).toHaveBeenLastCalledWith(line);
    expect(mockSet).toHaveBeenCalledWith('');
    expect(screen.getByTestId('mnemonic-word-24').props.value).toBe(line[23]);
  });

  it('fills all 24 from the paste button and refuses a clipboard that is not 24 words', async () => {
    const user = userEvent.setup();
    const onWords = jest.fn();
    await renderWithProviders(<Harness onWords={onWords} />);
    mockGet.mockResolvedValueOnce('only three words');
    await user.press(screen.getByRole('button', { name: 'Paste all 24 words' }));
    expect(await screen.findByText('The clipboard holds 3 words, not 24.')).toBeOnTheScreen();
    expect(onWords).not.toHaveBeenCalled();
    mockGet.mockResolvedValueOnce(line.join(' '));
    await user.press(screen.getByRole('button', { name: 'Paste all 24 words' }));
    expect(await screen.findByText('All 24 words filled from the clipboard.')).toBeOnTheScreen();
    expect(onWords).toHaveBeenLastCalledWith(line);
    expect(mockSet).toHaveBeenCalledWith('');
  });
});
