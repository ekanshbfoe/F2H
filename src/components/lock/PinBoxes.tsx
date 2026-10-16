import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { playSound } from '@/services/sounds';
import { useTheme } from '@/theme';

/** `checking`: all six digits are in and the PIN is being verified. */
export type PinBoxesState = 'idle' | 'checking' | 'error' | 'success';

export interface PinBoxesProps {
  /** Digits entered so far. */
  value: string;
  length?: number;
  state?: PinBoxesState;
  /** Called once the success sequence has finished playing (the screen may then move on). */
  onSuccessDone?: () => void;
  testID?: string;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** One lap of the light around a box while the PIN is checked. */
const LAP_MS = 1100;
/** The share of a box's outline the travelling light covers. */
const COMET = 0.28;
/** The success sequence reports done after this even if its animation was cut short. */
const SUCCESS_FALLBACK_MS = 1200;

function roundRectPerimeter(w: number, h: number, r: number): number {
  return 2 * (w + h) - 8 * r + 2 * Math.PI * r;
}

interface Geometry {
  /** Where each box's frame sits inside the row overlay (the overlay bleeds past the row). */
  x: (index: number) => number;
  y: number;
  w: number;
  h: number;
  r: number;
}

interface SlotProps {
  index: number;
  count: number;
  filled: boolean;
  /** The slot the next digit lands in. */
  active: boolean;
  tone: PinBoxesState;
  width: number;
  height: number;
  gap: number;
  gather: SharedValue<number>;
}

/**
 * One box: a clean white field with a frame; the box the next digit lands in turns blue and a
 * digit drops in as a dot. On success the boxes gather into the middle like a stack of cards.
 * Plain views only: the glow and the light around the frames are drawn once for the whole row.
 */
const Slot = memo(function Slot({
  index,
  count,
  filled,
  active,
  tone,
  width,
  height,
  gap,
  gather,
}: SlotProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const bead = useSharedValue(filled ? 1 : 0);
  const pressIn = t.motion.timingPressIn;
  const release = t.motion.springRelease;

  useEffect(() => {
    bead.set(
      filled
        ? reduceMotion
          ? withTiming(1, pressIn)
          : withSpring(1, release)
        : withTiming(0, pressIn),
    );
  }, [filled, reduceMotion, bead, pressIn, release]);

  const from = reduceMotion ? 1 : 0.4;
  const beadStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, bead.get() * 2),
    transform: [{ scale: from + bead.get() * (1 - from) }],
  }));

  const middle = (count - 1) / 2;
  const travel = (middle - index) * (width + gap);
  const tilt = (index - middle) * 5;
  const gatherStyle = useAnimatedStyle(() => {
    const g = gather.get();
    return {
      opacity: g < 0.7 ? 1 : Math.max(0, 1 - (g - 0.7) / 0.3),
      transform: [
        { translateX: travel * g },
        { rotate: `${tilt * Math.sin(Math.PI * g)}deg` },
        { scale: 1 - 0.08 * g },
      ],
    };
  });

  const frame =
    tone === 'error'
      ? t.colors.danger
      : tone === 'checking' || tone === 'success' || active
        ? t.colors.primary
        : filled
          ? t.colors.lineStrong
          : t.colors.line;
  const dot =
    tone === 'error' ? t.colors.danger : tone === 'idle' ? t.colors.ink : t.colors.primary;

  return (
    <Animated.View style={[{ width, height }, gatherStyle]}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: t.radii.md,
            borderWidth: t.sizes.border,
            borderColor: frame,
            backgroundColor: active ? t.colors.primaryTint : t.colors.surface,
            transitionProperty: ['borderColor', 'backgroundColor'],
            transitionDuration: t.motion.transitionMs,
            transitionTimingFunction: t.motion.cssEaseOut,
          },
        ]}
      />
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Animated.View
          style={[
            {
              width: t.spacing.md,
              height: t.spacing.md,
              borderRadius: t.radii.pill,
              backgroundColor: dot,
              transitionProperty: 'backgroundColor',
              transitionDuration: t.motion.transitionMs,
              transitionTimingFunction: t.motion.cssEaseOut,
            },
            beadStyle,
          ]}
        />
      </View>
    </Animated.View>
  );
});

/** A rounded rectangle as a path, clockwise from just after its top left corner. */
function outline(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} ` +
    `V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} ` +
    `A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`
  );
}

interface CometsProps {
  count: number;
  geometry: Geometry;
  color: string;
  strokeWidth: number;
  trace: SharedValue<number>;
}

/**
 * The light running around every frame. All six outlines are one path with one dash whose
 * period is exactly one outline, so a single animated value moves six lights in step: one
 * property update and one redraw per frame, cheap enough for the old phone.
 */
function Comets({ count, geometry: g, color, strokeWidth, trace }: CometsProps) {
  const perimeter = roundRectPerimeter(g.w, g.h, g.r);
  const d = Array.from({ length: count }, (_, i) => outline(g.x(i), g.y, g.w, g.h, g.r)).join(' ');
  const props = useAnimatedProps(() => ({ strokeDashoffset: -trace.get() * perimeter }));
  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeDasharray={[perimeter * COMET, perimeter * (1 - COMET)]}
      animatedProps={props}
    />
  );
}

interface SealProps {
  size: number;
  seal: SharedValue<number>;
  check: SharedValue<number>;
}

/** The one box the row gathers into: blue, glowing, and a tick drawing itself across it. */
function Seal({ size, seal, check }: SealProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const bleed = t.spacing.md;
  const outer = size + 2 * bleed;
  const style = useAnimatedStyle(() => {
    const s = seal.get();
    return {
      opacity: Math.min(1, s * 1.5),
      transform: [{ scale: reduceMotion ? 1 : 0.7 + 0.3 * s }],
    };
  });
  // the tick: down to the elbow, then up and out
  const a = { x: size * 0.3, y: size * 0.52 };
  const b = { x: size * 0.44, y: size * 0.66 };
  const c = { x: size * 0.71, y: size * 0.37 };
  const length = Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y);
  const tickProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - check.get()) }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.layer, { width: outer, height: outer, margin: -bleed }, style]}
    >
      <Svg width={outer} height={outer}>
        <Rect
          x={bleed - 6}
          y={bleed - 6}
          width={size + 12}
          height={size + 12}
          rx={t.radii.lg + 6}
          fill="none"
          stroke={t.colors.primary}
          strokeOpacity={0.12}
          strokeWidth={10}
        />
        <Rect
          x={bleed - 2}
          y={bleed - 2}
          width={size + 4}
          height={size + 4}
          rx={t.radii.lg + 2}
          fill="none"
          stroke={t.colors.primary}
          strokeOpacity={0.3}
          strokeWidth={4}
        />
        <Rect
          x={bleed}
          y={bleed}
          width={size}
          height={size}
          rx={t.radii.lg}
          fill={t.colors.primary}
        />
        <AnimatedPath
          d={`M ${a.x + bleed} ${a.y + bleed} L ${b.x + bleed} ${b.y + bleed} L ${c.x + bleed} ${c.y + bleed}`}
          fill="none"
          stroke={t.colors.onPrimary}
          strokeWidth={t.sizes.border * 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={[length, length]}
          animatedProps={tickProps}
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * Six boxes that announce how many digits are in (AC-11); digits are always masked.
 *
 * - checking: a light chases around every frame on the UI thread, so the scrypt wait (which
 *   blocks JavaScript on the old phone) still looks alive. It is one SVG for the whole row and
 *   exists only while checking.
 * - success: the unlock chime and the success haptic fire at once, the frames glow, the boxes
 *   gather into one blue seal and a tick draws across it, then `onSuccessDone`.
 * - error: a red flash of the glow and one decaying shake of the row.
 */
export function PinBoxes({
  value,
  length = 6,
  state = 'idle',
  onSuccessDone,
  testID,
}: PinBoxesProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const trace = useSharedValue(0);
  const glow = useSharedValue(0);
  const gather = useSharedValue(0);
  const seal = useSharedValue(0);
  const check = useSharedValue(0);
  const shake = useSharedValue(0);
  const { width: screen } = useWindowDimensions();
  const gap = t.spacing.sm;
  // 44 wide on a normal phone; narrower on a 320 dp one so six slots always fit the gutters
  const slotWidth = Math.min(
    t.sizes.touch,
    Math.floor((screen - 2 * t.sizes.sheetInset - (length - 1) * gap) / length),
  );
  const slotHeight = Math.min(t.sizes.pinBox, slotWidth + t.spacing.md);
  const rowWidth = length * slotWidth + (length - 1) * gap;
  const sealSize = Math.round(slotHeight * 1.1);

  // the row overlay bleeds past the boxes so the glow can spread outside the frames
  const bleed = t.spacing.md;
  const edge = t.sizes.border / 2;
  const geometry: Geometry = {
    x: (i) => bleed + i * (slotWidth + gap) + edge,
    y: bleed + edge,
    w: slotWidth - 2 * edge,
    h: slotHeight - 2 * edge,
    r: t.radii.md - edge,
  };
  const overlay = { width: rowWidth + 2 * bleed, height: slotHeight + 2 * bleed };
  const accent = state === 'error' ? t.colors.danger : t.colors.primary;

  // done once per success: from the end of the animation, or from the fallback timer
  const done = useRef(onSuccessDone);
  const reported = useRef(true);
  // lives as long as the success state, not as long as one run of the effect below
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (state === 'success') return undefined;
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    return undefined;
  }, [state]);
  useEffect(
    () => () => {
      if (fallback.current) clearTimeout(fallback.current);
    },
    [],
  );
  useLayoutEffect(() => {
    done.current = onSuccessDone;
  });
  const finish = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    done.current?.();
  }, []);

  const quickMs = t.motion.transitionMs;
  const easeOut = t.motion.easeOut;
  const easeInOut = t.motion.easeInOut;
  const holdMs = t.motion.glideMs;

  // One result cue per result: re-renders and a reduced motion toggle never replay it. A layout
  // effect, so the light starts in the same commit as the sixth digit, before the check blocks
  // the JavaScript thread.
  const announced = useRef<PinBoxesState>('idle');
  useLayoutEffect(() => {
    const fresh = state !== announced.current;
    announced.current = state;
    const quick = { duration: quickMs, easing: easeOut };

    if (state !== 'checking') cancelAnimation(trace);

    if (state === 'checking') {
      gather.set(0);
      seal.set(0);
      check.set(0);
      glow.set(withTiming(reduceMotion ? 1 : 0.35, quick));
      if (!reduceMotion) {
        trace.set(0);
        trace.set(withRepeat(withTiming(1, { duration: LAP_MS, easing: Easing.linear }), -1));
      }
      return undefined;
    }

    if (state === 'success') {
      if (!fresh) return undefined;
      reported.current = false;
      // sound and touch together, at the moment the PIN is known good; the chime's bells are
      // baked in late enough to ring as the boxes meet
      playSound('unlock');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (fallback.current) clearTimeout(fallback.current);
      fallback.current = setTimeout(finish, SUCCESS_FALLBACK_MS);
      const report = (f?: boolean) => {
        'worklet';
        if (f) scheduleOnRN(finish);
      };
      glow.set(withTiming(1, quick));
      if (reduceMotion) {
        // fewer, gentler: the boxes fade, the seal and its tick fade in where they stood
        gather.set(withTiming(1, quick));
        seal.set(withTiming(1, quick));
        check.set(
          withSequence(
            withTiming(1, quick),
            withDelay(holdMs, withTiming(1, { duration: 1 }, report)),
          ),
        );
      } else {
        // the boxes gather (moving on screen: ease in and out)
        gather.set(withDelay(40, withTiming(1, { duration: 220, easing: easeInOut })));
        // the seal arrives with the momentum of the stack, so it may overshoot once
        seal.set(withDelay(200, withSpring(1, { duration: 360, dampingRatio: 0.62 })));
        check.set(
          withSequence(
            withDelay(260, withTiming(1, { duration: 220, easing: easeOut })),
            withDelay(160, withTiming(1, { duration: 1 }, report)),
          ),
        );
      }
      return undefined;
    }

    gather.set(withTiming(0, quick));
    seal.set(withTiming(0, quick));
    check.set(0);

    if (state === 'error') {
      if (!fresh) return undefined;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      glow.set(withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 420 })));
      if (!reduceMotion) {
        // One decaying shake of the whole row, about 300 ms: a head shake, not a rattle.
        const step = { duration: 50, easing: easeInOut };
        shake.set(
          withSequence(
            withTiming(-10, step),
            withTiming(9, step),
            withTiming(-6, step),
            withTiming(4, step),
            withTiming(-2, step),
            withTiming(0, step),
          ),
        );
      }
      return undefined;
    }

    glow.set(withTiming(0, quick));
    return undefined;
  }, [
    state,
    reduceMotion,
    trace,
    glow,
    gather,
    seal,
    check,
    shake,
    finish,
    quickMs,
    easeOut,
    easeInOut,
    holdMs,
  ]);

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));
  // the frames' glow belongs to the row; it fades as the boxes leave their places
  const halo = useAnimatedStyle(() => ({ opacity: glow.get() * (1 - gather.get()) }));
  const ambient = useAnimatedStyle(() => ({ opacity: glow.get() }));
  const spreadX = t.sizes.sheetInset;
  const spreadY = t.spacing.lg;
  const tracing = state === 'checking' && !reduceMotion;

  return (
    <Animated.View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={
        state === 'success' ? 'PIN accepted' : `${value.length} of ${length} digits entered`
      }
      accessibilityLiveRegion="polite"
      style={[{ flexDirection: 'row', justifyContent: 'center', gap }, row]}
    >
      {/* light thrown on the sheet around the row while it glows */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.layer,
          {
            left: -spreadX,
            top: -spreadY,
            width: rowWidth + 2 * spreadX,
            height: slotHeight + 2 * spreadY,
          },
          ambient,
        ]}
      >
        <Svg width={rowWidth + 2 * spreadX} height={slotHeight + 2 * spreadY}>
          <Defs>
            <RadialGradient id="pin-ambient" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={accent} stopOpacity={0.16} />
              <Stop offset="1" stopColor={accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse
            cx={rowWidth / 2 + spreadX}
            cy={slotHeight / 2 + spreadY}
            rx={rowWidth / 2 + spreadX}
            ry={slotHeight / 2 + spreadY}
            fill="url(#pin-ambient)"
          />
        </Svg>
      </Animated.View>
      {/* the glow: soft rings outside every frame, one static drawing faded as a layer */}
      <Animated.View
        pointerEvents="none"
        style={[styles.layer, { left: -bleed, top: -bleed }, overlay, halo]}
      >
        <Svg {...overlay}>
          {Array.from({ length }, (_, i) => (
            <Rect
              key={i}
              x={geometry.x(i) - 3}
              y={geometry.y - 3}
              width={geometry.w + 6}
              height={geometry.h + 6}
              rx={geometry.r + 3}
              fill="none"
              stroke={accent}
              strokeOpacity={0.2}
              strokeWidth={6}
            />
          ))}
        </Svg>
      </Animated.View>
      {Array.from({ length }, (_, i) => (
        <Slot
          key={i}
          index={i}
          count={length}
          // a rejected PIN stays on screen, red, while it shakes; the next tap clears it
          filled={state !== 'idle' || i < value.length}
          active={state === 'idle' && i === value.length}
          tone={state}
          width={slotWidth}
          height={slotHeight}
          gap={gap}
          gather={gather}
        />
      ))}
      {tracing ? (
        <View pointerEvents="none" style={[styles.layer, { left: -bleed, top: -bleed }, overlay]}>
          <Svg {...overlay}>
            <Comets
              count={length}
              geometry={geometry}
              color={accent}
              strokeWidth={t.sizes.border + 1}
              trace={trace}
            />
          </Svg>
        </View>
      ) : null}
      <View
        pointerEvents="none"
        style={[
          styles.layer,
          {
            left: (rowWidth - sealSize) / 2,
            top: (slotHeight - sealSize) / 2,
            width: sealSize,
            height: sealSize,
          },
        ]}
      >
        <Seal size={sealSize} seal={seal} check={check} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
