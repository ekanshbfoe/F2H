import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';

import { useTheme, type ColorToken, type Tokens } from '@/theme';

export type TextVariant = keyof Tokens['typography'];

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: ColorToken;
  align?: 'left' | 'center' | 'right';
}

/** Typed text: every style comes from the typography and color tokens. */
export function Text({ variant = 'body', color = 'ink', align, style, ...rest }: TextProps) {
  const t = useTheme();
  return (
    <RNText
      {...rest}
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
