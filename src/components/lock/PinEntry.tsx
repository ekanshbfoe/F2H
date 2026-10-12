import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Text } from '@/components/ui';

import { useTheme } from '@/theme';

import { PinBoxes, type PinBoxesState } from './PinBoxes';
import { PinPad, pinPadHeight, usePinKeySize } from './PinPad';
import { PinProgress } from './PinProgress';

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
  /**
   * Take the full height: boxes on top, the status line under them, the pad pinned to the bottom
   * in the thumb zone.
   */
  fill?: boolean;
  /** Shows the progress bar in the status line (the PIN is being checked or saved). */
  busy?: boolean;
  busyLabel?: string;
  /** One short line under the boxes: an error, or a quiet note like the tries left. */
  status?: PinStatus | null;
  testID?: string;
}

export interface PinStatus {
  tone: 'danger' | 'muted';
  text: string;
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
  fill = false,
  busy = false,
  busyLabel,
  status = null,
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

  const { fontScale } = useWindowDimensions();
  const statusHeight = Math.ceil(
    2 * t.typography.caption.lineHeight! * Math.min(fontScale, t.sizes.maxFontScale),
  );
  const [padArea, setPadArea] = useState<number | undefined>(undefined);
  const keySize = usePinKeySize(fill ? padArea : undefined);
  const minPad = pinPadHeight(t.sizes.touch, t.spacing.md, t.sizes.buttonEdge);
  const pad = (
    <PinPad
      disabled={disabled}
      onDigit={onDigit}
      onDelete={onDelete}
      onClear={onClear}
      keySize={keySize}
      testID={testID ? `${testID}-pad` : undefined}
    />
  );

  return (
    <View
      style={[
        { gap: fill ? t.spacing.md : t.spacing.xxl, alignItems: 'center' },
        fill && styles.fill,
      ]}
      testID={testID}
    >
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
      {fill || busy || status ? (
        // A fixed two line slot: progress, an error or a note swap in place and never move the
        // pad, so the keys stay put while a PIN is being checked.
        <View style={[styles.between, { height: statusHeight }]}>
          {busy ? (
            <PinProgress visible label={busyLabel} />
          ) : status ? (
            <Animated.View
              key={status.text}
              entering={FadeIn.duration(t.motion.transitionMs).easing(t.motion.easeOut)}
            >
              <Text
                variant="caption"
                color={status.tone}
                align="center"
                numberOfLines={2}
                maxFontSizeMultiplier={t.sizes.maxFontScale}
                accessibilityLiveRegion="polite"
                accessibilityLabel={status.text}
              >
                {status.text}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      ) : null}
      {fill ? (
        // Everything left under the boxes belongs to the pad: measure it and size the keys to
        // fit, so the whole screen sits on one view even on a short old phone.
        <View
          style={[styles.padArea, { minHeight: minPad }]}
          onLayout={(e) => setPadArea(Math.floor(e.nativeEvent.layout.height))}
        >
          {/* hidden for the single frame before the area is measured, so it never flashes big */}
          <View style={[styles.padPin, { opacity: padArea === undefined ? 0 : 1 }]}>{pad}</View>
        </View>
      ) : (
        pad
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  fill: { flex: 1, alignSelf: 'stretch' },
  between: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  padArea: { flex: 1, alignSelf: 'stretch' },
  // absolute, so the pad never feeds back into the height it is sized from
  padPin: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
});
