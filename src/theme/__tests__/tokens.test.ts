import { colors, fontFamilies, motion, radii, shadows, spacing, typography } from '../tokens';

const HEX_OR_RGBA = /^(#[0-9A-F]{6}|rgba\(\d+, \d+, \d+, 0?\.\d+\)|transparent)$/i;

describe('design tokens', () => {
  it('every color is a hex or rgba value', () => {
    for (const [name, value] of Object.entries(colors)) {
      expect({ name, ok: HEX_OR_RGBA.test(value) }).toEqual({ name, ok: true });
    }
  });

  it('spacing follows the 4 pt grid above the hairline step', () => {
    for (const [name, value] of Object.entries(spacing)) {
      if (name === 'xxs') continue;
      expect(value % 4).toBe(0);
    }
  });

  it('radii grow monotonically', () => {
    expect(radii.sm).toBeLessThan(radii.md);
    expect(radii.md).toBeLessThan(radii.lg);
    expect(radii.lg).toBeLessThan(radii.xl);
    expect(radii.xl).toBeLessThan(radii.xxl);
  });

  it('typography only uses loaded Poppins families', () => {
    const families = new Set<string>(Object.values(fontFamilies));
    for (const style of Object.values(typography)) {
      expect(families.has(style.fontFamily as string)).toBe(true);
    }
  });

  it('shadows carry both iOS and Android depth', () => {
    expect(shadows.raised.elevation).toBeGreaterThan(0);
    expect(shadows.raised.shadowOpacity).toBeGreaterThan(0);
    expect(shadows.floating.elevation).toBeGreaterThan(shadows.raised.elevation ?? 0);
  });

  it('the overshoot spring is under damped', () => {
    expect(motion.springOvershoot.damping).toBeLessThan(motion.springSnappy.damping);
    expect(motion.pressScale).toBeLessThan(1);
  });
});
