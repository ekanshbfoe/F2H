import * as Clipboard from 'expo-clipboard';
import { useCallback, useRef, useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { Button, Text } from '@/components/ui';
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

  const setWord = useCallback(
    (index: number, text: string) => {
      const parts = splitWords(text);
      if (parts.length === MNEMONIC_WORDS) {
        onChange(parts);
        setPasteNote('All 24 words filled from the paste.');
        void Clipboard.setStringAsync('').catch(() => undefined);
        inputs.current[MNEMONIC_WORDS - 1]?.blur();
        return;
      }
      const next = value.slice();
      next[index] = text.toLowerCase().replace(/[^a-z]/g, '');
      onChange(next);
    },
    [onChange, value],
  );

  const pick = (index: number, word: string) => {
    const next = value.slice();
    next[index] = word;
    onChange(next);
    if (index < MNEMONIC_WORDS - 1) inputs.current[index + 1]?.focus();
    else inputs.current[index]?.blur();
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

  const suggestions = focused === null ? [] : suggest(value[focused] ?? '');
  const current = focused === null ? '' : (value[focused] ?? '');
  const showSuggestions =
    focused !== null &&
    current.length > 0 &&
    !(suggestions.length === 1 && suggestions[0] === current);

  return (
    <View style={{ gap: t.spacing.md }} testID={testID}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
        {value.map((word, i) => {
          const complete = word.length > 0 && focused !== i;
          const bad = complete && !isWord(word);
          const active = focused === i;
          return (
            <View
              key={i}
              style={{
                width: '48%',
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.xs,
                height: t.sizes.inputHeight,
                paddingHorizontal: t.spacing.sm,
                borderRadius: t.radii.md,
                backgroundColor: t.colors.surface,
                borderWidth: active ? t.sizes.border : t.sizes.hairline,
                borderColor: bad ? t.colors.danger : active ? t.colors.primary : t.colors.line,
              }}
            >
              <Text variant="caption" color="muted" style={{ width: 22 }}>
                {String(i + 1).padStart(2, '0')}
              </Text>
              <TextInput
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                value={word}
                onChangeText={(text) => setWord(i, text)}
                onFocus={() => setFocused(i)}
                onBlur={() => setFocused((f) => (f === i ? null : f))}
                onSubmitEditing={() => {
                  if (i < MNEMONIC_WORDS - 1) inputs.current[i + 1]?.focus();
                }}
                returnKeyType={i < MNEMONIC_WORDS - 1 ? 'next' : 'done'}
                blurOnSubmit={i === MNEMONIC_WORDS - 1}
                editable={!disabled}
                accessibilityLabel={`Word ${i + 1} of 24`}
                accessibilityHint={bad ? 'Not a word from the kit list' : undefined}
                testID={`${testID}-word-${i + 1}`}
                style={[t.typography.label, { flex: 1, color: t.colors.ink, paddingVertical: 0 }]}
                {...HYGIENE}
              />
            </View>
          );
        })}
      </View>
      {showSuggestions ? (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}
          accessibilityRole="list"
          testID={`${testID}-suggestions`}
        >
          {suggestions.length === 0 ? (
            <Text variant="caption" color="danger">
              No kit word starts like that.
            </Text>
          ) : (
            suggestions.map((s) => (
              <Pressable
                key={s}
                onPress={() => focused !== null && pick(focused, s)}
                accessibilityRole="button"
                accessibilityLabel={`Use ${s} for word ${(focused ?? 0) + 1}`}
                style={({ pressed }) => ({
                  paddingHorizontal: t.spacing.md,
                  height: t.sizes.touch - 8,
                  justifyContent: 'center',
                  borderRadius: t.radii.pill,
                  backgroundColor: pressed ? t.colors.primaryTint : t.colors.skyTint,
                })}
                testID={`${testID}-suggest-${s}`}
              >
                <Text variant="label" color="primary">
                  {s}
                </Text>
              </Pressable>
            ))
          )}
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
