import { View } from 'react-native';

import { GlowBox, type GlowState } from '@/components/motion';
import { useTheme } from '@/theme';

export type PinBoxesState = 'idle' | 'error' | 'success';

export interface PinBoxesProps {
  /** Digits entered so far. */
  value: string;
  length?: number;
  state?: PinBoxesState;
  testID?: string;
}

/** Six glow boxes that announce how many digits are in (AC-11); digits are always masked. */
export function PinBoxes({ value, length = 6, state = 'idle', testID }: PinBoxesProps) {
  const t = useTheme();
  const boxState = (i: number): GlowState => {
    if (state === 'error') return 'error';
    if (state === 'success') return 'success';
    return i < value.length ? 'filled' : 'idle';
  };
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${value.length} of ${length} digits entered`}
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', justifyContent: 'center', gap: t.spacing.sm }}
    >
      {Array.from({ length }, (_, i) => (
        <GlowBox
          key={i}
          value={i < value.length ? '•' : ''}
          state={boxState(i)}
          masked
          size={t.sizes.pinBox}
        />
      ))}
    </View>
  );
}
