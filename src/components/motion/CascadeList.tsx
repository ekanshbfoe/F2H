import { Children, isValidElement, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

export interface CascadeListProps extends ViewProps {
  children: ReactNode;
  /** Gap between items, in spacing tokens. */
  gap?: 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
}

/**
 * Children spring into place one after another (login reference field cascade)
 * and reflow on a spring when siblings are added or removed. Give each child a key.
 */
export function CascadeList({ children, gap = 'xl', style, ...rest }: CascadeListProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View {...rest} style={[{ gap: t.spacing[gap] }, style]}>
      {items.map((child, i) => (
        <Animated.View
          key={child.key ?? i}
          layout={
            reduceMotion
              ? undefined
              : LinearTransition.springify()
                  .damping(t.motion.springOvershoot.damping)
                  .stiffness(t.motion.springOvershoot.stiffness)
          }
          entering={
            reduceMotion
              ? undefined
              : FadeInDown.delay(i * t.motion.cascadeStepMs)
                  .springify()
                  .damping(t.motion.springOvershoot.damping)
                  .stiffness(t.motion.springOvershoot.stiffness)
          }
          exiting={reduceMotion ? undefined : FadeOut.duration(t.motion.timingMicro.duration)}
        >
          {child}
        </Animated.View>
      ))}
    </View>
  );
}
