import * as Clipboard from 'expo-clipboard';
import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { TextInput, useWindowDimensions, View, type TextInputProps } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Text, Well } from '@/components/ui';
import { useTheme } from '@/theme';

export const MNEMONIC_WORDS = 24;

export interface MnemonicEntryProps {
  /** Exactly 24 strings; the parent owns and clears them. */
  value: string[];
  onChange: (words: string[]) => void;
  /** Word list completions for a prefix (the app passes `mnemonic.suggest`). */
  suggest: (prefix: string) => string[];
  /** Whether a finished word is in the list (the app passes `mnemonic.isWord`). */
  isWord: (word: string) => boolean;
  disabled?: boolean;
  testID?: string;
}

/** The hygiene every box gets: no autocorrect, no autofill, no keyboard learning (AC-3). */
const HYGIENE: TextInputProps = {
  autoCapitalize: 'none',
  autoCorrect: false,
  autoComplete: 'off',
  textContentType: 'none',
  importantForAutofill: 'no',
  spellCheck: false,
  keyboardType: 'visible-password',
  contextMenuHidden: false,
};

function splitWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0);
}

interface WordWellProps {
  index: number;
  word: string;
  active: boolean;
  bad: boolean;
  disabled: boolean;
  testID: string;
  onWord: (index: number, text: string) => void;
  onFocusWord: (index: number) => void;
  onBlurWord: (index: number) => void;
  onNext: (index: number) => void;
  register: (index: number, el: TextInput | null) => void;
}

/**
 * One word box, sunk into the card. Memoised on plain props with stable handlers, so a keystroke
 * re-renders the box being typed in, not all 24.
 */
const WordWell = memo(function WordWell({
  index,
  word,
  active,
  bad,
  disabled,
  testID,
  onWord,
  onFocusWord,
  onBlurWord,
  onNext,
  register,
}: WordWellProps) {
  const t = useTheme();
  const last = index === MNEMONIC_WORDS - 1;
  return (
    <Well
      frame={bad ? t.colors.danger : active ? t.colors.primary : t.colors.line}
      style={{ flex: 1, height: t.sizes.inputHeight }}
      floorStyle={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.xs,
        paddingHorizontal: t.spacing.sm,
      }}
    >
      <Text
        variant="caption"
        color={bad ? 'danger' : active ? 'primary' : 'muted'}
        style={{ minWidth: t.spacing.xl }}
      >
        {String(index + 1).padStart(2, '0')}
      </Text>
      <TextInput
        ref={(el) => register(index, el)}
        value={word}
        onChangeText={(text) => onWord(index, text)}
        onFocus={() => onFocusWord(index)}
        onBlur={() => onBlurWord(index)}
        onSubmitEditing={() => onNext(index)}
        returnKeyType={last ? 'done' : 'next'}
        blurOnSubmit={last}
        editable={!disabled}
        accessibilityLabel={`Word ${index + 1} of 24`}
        accessibilityHint={bad ? 'Not a word from the kit list' : undefined}
        testID={`${testID}-word-${index + 1}`}
        style={[t.typography.label, { flex: 1, color: t.colors.ink, paddingVertical: 0 }]}
        {...HYGIENE}
      />
    </Well>
  );
});

/**
 * 24 numbered boxes for a BIP39 kit (self approval spec, AC-3): completions under the active
 * box, a whole line pasted into any box or through the paste button fills all 24, and the
 * clipboard is cleared after a paste so the words do not linger there.
 */
export function MnemonicEntry({
  value,
  onChange,
  suggest,
  isWord,
  disabled = false,
  testID = 'mnemonic',
}: MnemonicEntryProps) {
  const t = useTheme();
  const inputs = useRef<(TextInput | null)[]>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  // the boxes call back through refs, so their handlers never change identity
  const latest = useRef({ value, onChange });
  useLayoutEffect(() => {
    latest.current = { value, onChange };
  });

  const onWord = useCallback((index: number, text: string) => {
    const { value: words, onChange: change } = latest.current;
    const parts = splitWords(text);
    if (parts.length === MNEMONIC_WORDS) {
      change(parts);
      setPasteNote('All 24 words filled from the paste.');
      void Clipboard.setStringAsync('').catch(() => undefined);
      inputs.current[index]?.blur?.();
      return;
    }
    const next = words.slice();
    next[index] = text.toLowerCase().replace(/[^a-z]/g, '');
    change(next);
  }, []);
  // Moving to the next box blurs one and focuses the other in two separate events; the blur is
  // held for a frame so the reserved suggestion slot never collapses and bounces in between.
  const pendingBlur = useRef<number | null>(null);
  const onFocusWord = useCallback((index: number) => {
    if (pendingBlur.current !== null) cancelAnimationFrame(pendingBlur.current);
    pendingBlur.current = null;
    setFocused(index);
  }, []);
  const onBlurWord = useCallback((index: number) => {
    if (pendingBlur.current !== null) cancelAnimationFrame(pendingBlur.current);
    pendingBlur.current = requestAnimationFrame(() => {
      pendingBlur.current = null;
      setFocused((f) => (f === index ? null : f));
    });
  }, []);
  const onNext = useCallback((index: number) => {
    if (index < MNEMONIC_WORDS - 1) inputs.current[index + 1]?.focus?.();
  }, []);
  const register = useCallback((index: number, el: TextInput | null) => {
    inputs.current[index] = el;
  }, []);

  const pick = (index: number, word: string) => {
    const next = value.slice();
    next[index] = word;
    onChange(next);
    if (index < MNEMONIC_WORDS - 1) inputs.current[index + 1]?.focus?.();
    else inputs.current[index]?.blur?.();
  };

  const pasteAll = async () => {
    let text = '';
    try {
      text = await Clipboard.getStringAsync();
    } catch {
      text = '';
    }
    const parts = splitWords(text);
    if (parts.length !== MNEMONIC_WORDS) {
      setPasteNote(`The clipboard holds ${parts.length} words, not 24.`);
      return;
    }
    onChange(parts);
    setPasteNote('All 24 words filled from the clipboard.');
    await Clipboard.setStringAsync('').catch(() => undefined);
  };

  // as many chips as fit one row: two on a narrow phone, four otherwise
  const { width } = useWindowDimensions();
  const room = width < t.sizes.wideScreen ? 2 : 4;
  const suggestions = focused === null ? [] : suggest(value[focused] ?? '').slice(0, room);
  const current = focused === null ? '' : (value[focused] ?? '');
  const showSuggestions =
    focused !== null &&
    current.length > 0 &&
    !(suggestions.length === 1 && suggestions[0] === current);

  const filled = value.filter((w) => w.length > 0).length;
  const rows: number[][] = [];
  for (let i = 0; i < MNEMONIC_WORDS; i += 2) rows.push([i, i + 1]);

  return (
    <View style={{ gap: t.spacing.md }} testID={testID}>
      <View style={{ gap: t.spacing.xs }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="label" color="ink">
            Your 24 words
          </Text>
          <Text variant="caption" color="muted" importantForAccessibility="no">
            {`${filled} of ${MNEMONIC_WORDS}`}
          </Text>
        </View>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Words filled"
          accessibilityValue={{ min: 0, max: MNEMONIC_WORDS, now: filled }}
          style={{
            height: t.sizes.progress,
            borderRadius: t.radii.pill,
            backgroundColor: t.colors.line,
            overflow: 'hidden',
          }}
        >
          {/* absolute and childless, so its width may animate without a layout pass for others */}
          <Animated.View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${(filled / MNEMONIC_WORDS) * 100}%`,
              borderRadius: t.radii.pill,
              backgroundColor: t.colors.primary,
              transitionProperty: 'width',
              transitionDuration: t.motion.glideMs,
              transitionTimingFunction: t.motion.cssEaseOut,
            }}
          />
        </View>
      </View>
      {rows.map((pair) => (
        <View key={pair[0]} style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          {pair.map((i) => {
            const word = value[i] ?? '';
            const bad = word.length > 0 && focused !== i && !isWord(word);
            return (
              <WordWell
                key={i}
                index={i}
                word={word}
                active={focused === i}
                bad={bad}
                disabled={disabled}
                testID={testID}
                onWord={onWord}
                onFocusWord={onFocusWord}
                onBlurWord={onBlurWord}
                onNext={onNext}
                register={register}
              />
            );
          })}
        </View>
      ))}
      {focused !== null ? (
        // reserved while a box is focused, so suggestions appearing never push the rest down
        <View style={{ minHeight: t.sizes.touch + t.sizes.buttonEdge, justifyContent: 'center' }}>
          {showSuggestions ? (
            <Animated.View
              entering={FadeIn.duration(t.motion.transitionMs).easing(t.motion.easeOut)}
              style={{ flexDirection: 'row', gap: t.spacing.sm }}
              accessibilityRole="list"
              testID={`${testID}-suggestions`}
            >
              {suggestions.length === 0 ? (
                <Text variant="caption" color="danger">
                  No kit word starts like that.
                </Text>
              ) : (
                suggestions.map((s) => (
                  <Button
                    key={s}
                    variant="secondary"
                    size="sm"
                    fullWidth={false}
                    onPress={() => focused !== null && pick(focused, s)}
                    accessibilityLabel={`Use ${s} for word ${(focused ?? 0) + 1}`}
                    testID={`${testID}-suggest-${s}`}
                  >
                    {s}
                  </Button>
                ))
              )}
            </Animated.View>
          ) : null}
        </View>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        onPress={() => void pasteAll()}
        disabled={disabled}
        testID={`${testID}-paste`}
      >
        Paste all 24 words
      </Button>
      {pasteNote ? (
        <Text variant="caption" color="muted" accessibilityLiveRegion="polite">
          {pasteNote}
        </Text>
      ) : null}
    </View>
  );
}
