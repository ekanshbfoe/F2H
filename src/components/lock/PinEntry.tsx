import { useEffect, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '@/theme';

import { PinBoxes, type PinBoxesState } from './PinBoxes';
import { PinPad } from './PinPad';

export interface PinEntryProps {
  value: string;
  onChange: (pin: string) => void;
  /** Called once when the sixth digit lands. */
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

  const set = (next: string) => {
    if (disabled) return;
    onChange(next.replace(/\D/g, '').slice(0, length));
  };

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
        onDigit={(d) => set(value + d)}
        onDelete={() => set(value.slice(0, -1))}
        testID={testID ? `${testID}-pad` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
