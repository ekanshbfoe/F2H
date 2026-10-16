/**
 * F2H design tokens: the single source of truth for every visual value.
 * Spec: docs/specs/0001-system-architecture/0001-design-system-motion.md
 * Art direction: design.md (root). No component may use a literal color or size.
 */
import { cubicBezier, Easing } from 'react-native-reanimated';
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
  /** The native splash background (app.json) and the logo's own field; the boot screen matches it. */
  splash: '#3575DF',
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
  /** Thickness of a progress track. */
  progress: 4,
  border: 2,
  focusRing: 3,
  /** Below this window height the PIN screens tighten their spacing and drop the mascot. */
  compactHeight: 680,
  /** At or above this window width a row has room for four word chips instead of two. */
  wideScreen: 360,
  /** The phone width the type scale is drawn for; narrower phones get proportionally smaller text. */
  designWidth: 390,
  /** The smallest a narrow phone shrinks the type scale to. */
  minTypeScale: 0.86,
  /** The largest text scale the fixed PIN screen slots are sized for. */
  maxFontScale: 1.3,
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
  display: { fontFamily: fontFamilies.semibold, fontSize: 28, lineHeight: 36 },
  title: { fontFamily: fontFamilies.medium, fontSize: 22, lineHeight: 30 },
  heading: { fontFamily: fontFamilies.medium, fontSize: 18, lineHeight: 26 },
  label: { fontFamily: fontFamilies.medium, fontSize: 14, lineHeight: 20 },
  body: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fontFamilies.regular, fontSize: 12, lineHeight: 17 },
  button: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 20, letterSpacing: 0.3 },
  pin: { fontFamily: fontFamilies.medium, fontSize: 24, lineHeight: 32 },
};

/** Strong ease out for anything entering or answering a touch. */
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);
/** For things moving across the screen. */
const easeInOut = Easing.bezier(0.77, 0, 0.175, 1);

/** Motion presets reverse engineered from the reference videos. */
export const motion = {
  easeOut,
  easeInOut,
  /** The same two curves for Reanimated CSS transitions, which take their own type. */
  cssEaseOut: cubicBezier(0.23, 1, 0.32, 1),
  cssEaseInOut: cubicBezier(0.77, 0, 0.175, 1),
  /** A small state change: a colour, a ring, a pill moving one step. */
  transitionMs: 150,
  glideMs: 250,
  /** A step title sliding in from the side you are heading to. */
  timingStep: { duration: 200, easing: easeOut },
  stepSlide: 16,
  /** Rare screens: content rising into place, one beat apart. */
  timingEnter: { duration: 260, easing: easeOut },
  enterRise: 12,
  /** Where a medallion starts as it settles in, and how far its icon is turned. */
  enterScale: 0.92,
  enterTilt: '-14deg',
  enterStepMs: 60,
  /** The PIN gate leaving after the right PIN: short, it happens many times a day. */
  gateExitScale: 1.02,
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
  /** Finger down on a physical key: a fast, strong ease out so the press lands at once. */
  timingPressIn: { duration: 100, easing: easeOut },
  /** Finger up: the key pops back past its rest height once (about 10 percent), then settles. */
  springRelease: { duration: 220, dampingRatio: 0.6 },
  /** Flash overlay on tap (login reference). */
  flashInMs: 60,
  flashOutMs: 180,
  /** A boot that runs longer than this shows a spinner under the logo; a quick one never does. */
  bootSpinnerDelayMs: 600,
} as const;

export const opacity = {
  disabled: 0.45,
  pressed: 0.85,
  placeholder: 0.6,
  /** The pad while a full PIN is being checked: it still reads, it just steps back. */
  resting: 0.6,
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
