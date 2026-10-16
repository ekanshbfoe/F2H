import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useWindowDimensions } from 'react-native';

import { tokens, typography, type Tokens } from './tokens';

const ThemeContext = createContext<Tokens>(tokens);

/**
 * The type scale for a screen this wide: full size from the design width up, shrinking in step
 * with a narrower phone down to `minTypeScale`, so a small phone shows the same layout instead of
 * the same text crowding it. Rounded to whole points and to 2 percent steps so it is computed for
 * a handful of widths, not every rotation.
 */
export function typeScaleFor(width: number): number {
  const raw = width / tokens.sizes.designWidth;
  const clamped = Math.min(1, Math.max(tokens.sizes.minTypeScale, raw));
  return Math.round(clamped * 50) / 50;
}

export function scaledTokens(scale: number): Tokens {
  if (scale === 1) return tokens;
  const scaled = Object.fromEntries(
    Object.entries(typography).map(([name, style]) => [
      name,
      {
        ...style,
        fontSize: Math.round((style.fontSize ?? 0) * scale),
        lineHeight: Math.round((style.lineHeight ?? 0) * scale),
      },
    ]),
  ) as Tokens['typography'];
  return { ...tokens, typography: scaled };
}

/** Provides the design tokens, with the type scale fitted to the phone's width. */
export function ThemeProvider({ children, value }: PropsWithChildren<{ value?: Tokens }>) {
  const { width } = useWindowDimensions();
  const scale = typeScaleFor(width);
  const fitted = useMemo(() => scaledTokens(scale), [scale]);
  return <ThemeContext.Provider value={value ?? fitted}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Tokens {
  return useContext(ThemeContext);
}
