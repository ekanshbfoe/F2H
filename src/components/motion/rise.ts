import {
  useReducedMotion,
  withDelay,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

/**
 * Entering animation for content on rare screens: it rises `motion.enterRise` into place with a
 * fade, after `delayMs`. Reduced motion keeps only the fade.
 */
export function useRiseIn(): (delayMs: number) => EntryExitAnimationFunction {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const dy = reduceMotion ? 0 : t.motion.enterRise;
  const timing = t.motion.timingEnter;
  return (delayMs) => () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: dy }] },
      animations: {
        opacity: withDelay(delayMs, withTiming(1, timing)),
        transform: [{ translateY: withDelay(delayMs, withTiming(0, timing)) }],
      },
    };
  };
}
