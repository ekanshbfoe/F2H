import { createContext, useContext, type PropsWithChildren } from 'react';

import { tokens, type Tokens } from './tokens';

const ThemeContext = createContext<Tokens>(tokens);

/** Provides the design tokens. Dark mode will swap the value here later. */
export function ThemeProvider({ children, value = tokens }: PropsWithChildren<{ value?: Tokens }>) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Tokens {
  return useContext(ThemeContext);
}
