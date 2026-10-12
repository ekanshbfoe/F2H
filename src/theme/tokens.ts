/**
 * F2H design tokens: the single source of truth for every visual value.
 * Spec: docs/specs/0001-system-architecture/0001-design-system-motion.md
 * Art direction: design.md (root). No component may use a literal color or size.
 */
import { Easing } from 'react-native-reanimated';
import type { TextStyle, ViewStyle } from 'react-native';

export const colors = {
  /** Brand blue derived from the bear logo. */
  primary: '#2F5BEA',
  /** Pressed state and the 2.5D bottom edge of primary buttons. */
  primaryDark: '#1E3FB8',
  /** Soft tint for selected and pressed surfaces on blue. */
  primaryTint: '#E8EEFF',
  /** Sky accent from the approval reference (icons, callouts). */
  sky: '#4FB3EE',
  skyTint: '#E6F4FD',
  surface: '#FFFFFF',
  canvas: '#F5F8FF',
  /** Charcoal used by the login reference card. */
  charcoal: '#1F1C1E',
  ink: '#14181F',
  body: '#2B3240',
  muted: '#6B7280',
  line: '#E5E9F2',
  lineStrong: '#CBD2E1',
  success: '#22C55E',
  successTint: '#E8F9EF',
  danger: '#EF4444',
  /** The darker bottom edge of a danger button. */
  dangerDark: '#B91C1C',
  dangerTint: '#FDECEC',
  warning: '#F59E0B',
  /** Background of a warning badge. */
  warningTint: '#FFF4DF',
  /** Onboarding only (working.md): warm text colors. Never elsewhere. */
  warmOrange: '#FF7A1A',
  warmYellow: '#FFC53D',
  warmRed: '#F0443C',
  scrim: 'rgba(20, 24, 31, 0.55)',
  onPrimary: '#FFFFFF',
  focus: '#1E3FB8',
} as const;

export type ColorToken = keyof typeof colors;

/** 4 pt grid. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  xxl: 28,
  pill: 999,
} as const;

export const sizes = {
  /** Minimum touch target. */
  touch: 44,
  buttonHeight: 56,
  /** Bottom edge strip of 2.5D buttons. */
  buttonEdge: 4,
  inputHeight: 48,
  icon: 20,
  iconLg: 24,
  pinBox: 56,
  pinBoxLg: 64,
  avatar: 40,
  /** Mascot and hero illustrations. */
  hero: 120,
  sheetInset: 20,
  sheetHandleWidth: 36,
  sheetHandleHeight: 4,
  toggleHeight: 42,
  hairline: 1,
  border: 2,
  focusRing: 3,
} as const;

type Shadow = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOpacity' | 'shadowRadius' | 'shadowOffset' | 'elevation'
>;

export const shadows: Record<'none' | 'raised' | 'floating' | 'glow' | 'dangerGlow', Shadow> = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  raised: {
    shadowColor: '#14287A',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  floating: {
    shadowColor: '#14287A',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  glow: {
    shadowColor: '#2F5BEA',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  dangerGlow: {
    shadowColor: '#EF4444',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
};

export const fontFamilies = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
} as const;

type Type = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing'>;

export const typography: Record<
  'display' | 'title' | 'heading' | 'label' | 'body' | 'caption' | 'button' | 'pin',
  Type
> = {
  display: { fontFamily: fontFamilies.semibold, fontSize: 32, lineHeight: 40 },
  title: { fontFamily: fontFamilies.semibold, fontSize: 24, lineHeight: 32 },
  heading: { fontFamily: fontFamilies.semibold, fontSize: 20, lineHeight: 28 },
  label: { fontFamily: fontFamilies.medium, fontSize: 15, lineHeight: 22 },
  body: { fontFamily: fontFamilies.regular, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 18 },
  button: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 20, letterSpacing: 0.4 },
  pin: { fontFamily: fontFamilies.semibold, fontSize: 24, lineHeight: 32 },
};

/** Motion presets reverse engineered from the reference videos. */
export const motion = {
  /** Toggle pill: visible overshoot past the track. */
  springOvershoot: { damping: 11, stiffness: 180, mass: 0.8 },
  /** Snappy settle for small elements. */
  springSnappy: { damping: 14, stiffness: 180 },
  /** Soft settle for sheets and large panels. */
  springSoft: { damping: 18, stiffness: 120 },
  /** Button morph and most layout moves. */
  timingFast: { duration: 250, easing: Easing.out(Easing.cubic) },
  /** Radial reveal. */
  timingReveal: { duration: 300, easing: Easing.bezier(0.4, 0, 0.2, 1) },
  /** Color and opacity crossfades. */
  timingMicro: { duration: 120, easing: Easing.out(Easing.quad) },
  /** Border trace. */
  timingTrace: { duration: 130, easing: Easing.linear },
  /** Stagger between cascading items. */
  cascadeStepMs: 30,
  /** Press feedback scale. */
  pressScale: 0.97,
  /** Flash overlay on tap (login reference). */
  flashInMs: 60,
  flashOutMs: 180,
} as const;

export const opacity = {
  disabled: 0.45,
  pressed: 0.85,
  placeholder: 0.6,
} as const;

export const tokens = {
  colors,
  spacing,
  radii,
  sizes,
  shadows,
  typography,
  fontFamilies,
  motion,
  opacity,
} as const;
export type Tokens = typeof tokens;
