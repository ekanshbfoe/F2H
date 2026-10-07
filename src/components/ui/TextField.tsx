import { forwardRef, useId, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  hint?: string;
  /** Password style field with a show/hide control. */
  secure?: boolean;
  /** Dark variant for the charcoal login card. */
  onDark?: boolean;
}

/**
 * Underline style field from the login reference: label above a hairline,
 * no box. Focus thickens the line in primary; error turns it danger.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, secure = false, onDark = false, onFocus, onBlur, editable = true, ...rest },
  ref,
) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secure);
  const id = useId();
  const invalid = Boolean(error);

  const lineColor = invalid
    ? t.colors.danger
    : focused
      ? onDark
        ? t.colors.sky
        : t.colors.primary
      : onDark
        ? 'rgba(255,255,255,0.25)'
        : t.colors.line;

  return (
    <View style={{ gap: t.spacing.xs }}>
      <Text variant="label" color={onDark ? 'onPrimary' : 'body'} nativeID={`${id}-label`}>
        {label}
      </Text>
      <View style={styles.row}>
        <TextInput
          ref={ref}
          {...rest}
          editable={editable}
          secureTextEntry={secure && hidden}
          accessibilityLabel={label}
          accessibilityLabelledBy={`${id}-label`}
          accessibilityHint={error ?? hint}
          accessibilityState={{ disabled: !editable }}
          placeholderTextColor={onDark ? 'rgba(255,255,255,0.5)' : t.colors.muted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            t.typography.body,
            styles.input,
            {
              color: onDark ? t.colors.onPrimary : t.colors.ink,
              height: t.sizes.inputHeight,
              opacity: editable ? 1 : t.opacity.disabled,
            },
          ]}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            onPress={() => setHidden((h) => !h)}
            hitSlop={t.spacing.sm}
            style={{
              minHeight: t.sizes.touch,
              justifyContent: 'center',
              paddingLeft: t.spacing.sm,
            }}
          >
            <Text variant="caption" color={onDark ? 'sky' : 'primary'}>
              {hidden ? 'Show' : 'Hide'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View
        style={{
          height: focused || invalid ? t.sizes.border : t.sizes.hairline,
          backgroundColor: lineColor,
          borderRadius: t.radii.pill,
        }}
      />
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color={onDark ? 'sky' : 'muted'}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, paddingVertical: 0 },
});
