import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '@/theme';

import { PinBoxes, type PinBoxesState } from './PinBoxes';
import { PinPad } from './PinPad';

export interface PinEntryProps {
  value: string;
  onChange: (pin: string) => void;
  /**
   * Called once when the sixth digit lands. Input then pauses until the parent clears the value
   * (or moves on), so a stray tap can never edit or resubmit a PIN that is being checked.
   */
  onComplete?: (pin: string) => void;
  length?: number;
  state?: PinBoxesState;
  disabled?: boolean;
  testID?: string;
}

/**
 * Boxes plus pad plus a hidden input so a hardware keyboard can type digits (AC-11). The input
 * never shows the soft keyboard; the pad is the only on screen way in.
 */
export function PinEntry({
  value,
  onChange,
  onComplete,
  length = 6,
  state = 'idle',
  disabled = false,
  testID,
}: PinEntryProps) {
  const t = useTheme();
  const input = useRef<TextInput>(null);
  const completed = useRef<string | null>(null);

  useEffect(() => {
    if (value.length === length && completed.current !== value) {
      completed.current = value;
      onComplete?.(value);
    }
    if (value.length < length) completed.current = null;
  }, [value, length, onComplete]);

  // The pad commits from the gesture thread, so two quick taps can both land before React renders
  // the first. Reading the latest value (and props) from refs keeps every digit and keeps the
  // pad's callbacks stable, so its memoised keys never re-render on a tap.
  // Synced before paint, so a tap that lands right after the parent clears a wrong PIN builds on
  // the cleared value, not on the six digits that were just checked.
  const submits = Boolean(onComplete);
  const latest = useRef({ value, onChange, disabled, length, submits });
  useLayoutEffect(() => {
    latest.current = { value, onChange, disabled, length, submits };
  });

  const set = useCallback((next: string) => {
    const l = latest.current;
    if (l.disabled) return;
    if (l.submits && l.value.length >= l.length) return;
    const clean = next.replace(/\D/g, '').slice(0, l.length);
    l.value = clean;
    l.onChange(clean);
  }, []);
  const onDigit = useCallback((d: string) => set(latest.current.value + d), [set]);
  const onDelete = useCallback(() => set(latest.current.value.slice(0, -1)), [set]);
  const onClear = useCallback(() => set(''), [set]);

  return (
    <View style={{ gap: t.spacing.xxl, alignItems: 'center' }} testID={testID}>
      <PinBoxes
        value={value}
        length={length}
        state={state}
        testID={testID ? `${testID}-boxes` : undefined}
      />
      <TextInput
        ref={input}
        value={value}
        onChangeText={set}
        keyboardType="number-pad"
        showSoftInputOnFocus={false}
        caretHidden
        autoFocus
        maxLength={length}
        editable={!disabled}
        accessibilityLabel="PIN"
        accessibilityHint="Type six digits"
        importantForAccessibility="no"
        style={styles.hidden}
        testID={testID ? `${testID}-input` : undefined}
      />
      <PinPad
        disabled={disabled}
        onDigit={onDigit}
        onDelete={onDelete}
        onClear={onClear}
        testID={testID ? `${testID}-pad` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
