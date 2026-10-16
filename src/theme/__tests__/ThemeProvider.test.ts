import { scaledTokens, typeScaleFor } from '../ThemeProvider';
import { tokens } from '../tokens';

describe('responsive type scale', () => {
  it('keeps full size from the design width up and shrinks on narrow phones, with a floor', () => {
    expect(typeScaleFor(390)).toBe(1);
    expect(typeScaleFor(430)).toBe(1);
    expect(typeScaleFor(360)).toBe(0.92);
    expect(typeScaleFor(320)).toBe(0.86);
    expect(typeScaleFor(280)).toBe(0.86);
  });

  it('scales only the type, to whole points', () => {
    const small = scaledTokens(0.86);
    expect(small.typography.title.fontSize).toBe(Math.round(22 * 0.86));
    expect(small.typography.body.lineHeight).toBe(Math.round(22 * 0.86));
    expect(small.spacing).toBe(tokens.spacing);
    expect(scaledTokens(1)).toBe(tokens);
  });
});
