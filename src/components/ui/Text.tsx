import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';

import { useTheme, type ColorToken, type Tokens } from '@/theme';

export type TextVariant = keyof Tokens['typography'];

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: ColorToken;
  align?: 'left' | 'center' | 'right';
}

/** Typed text: every style comes from the typography and color tokens. */
export function Text({
  variant = 'body',
  color = 'ink',
  align,
  style,
  maxFontSizeMultiplier,
  ...rest
}: TextProps) {
  const t = useTheme();
  return (
    <RNText
      {...rest}
      // a very large system font setting still grows text, but only as far as layouts can hold
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? t.sizes.maxFontScale}
      style={[
        t.typography[variant],
        { color: t.colors[color] },
        align ? { textAlign: align } : null,
        styles.base,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { includeFontPadding: false },
});
