import { View } from 'react-native';

import { Text, Well } from '@/components/ui';
import { useTheme } from '@/theme';

export interface FingerprintProps {
  /** Four groups of four hex digits, space separated. */
  value: string;
  label?: string;
  testID?: string;
}

/**
 * The key fingerprint as four recessed wells, one group each: the same groups printed on the
 * paper kit, so comparing them by eye is group against group, not a 19 character squint.
 */
export function Fingerprint({ value, label = 'Fingerprint', testID }: FingerprintProps) {
  const t = useTheme();
  const groups = value.split(/\s+/).filter(Boolean);
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${value}`}
      testID={testID}
      style={{ flexDirection: 'row', gap: t.spacing.sm }}
    >
      {groups.map((g, i) => (
        <Well
          key={`${i}-${g}`}
          style={{ flex: 1 }}
          floorStyle={{ paddingVertical: t.spacing.sm, alignItems: 'center' }}
        >
          <Text variant="label" color="ink" numberOfLines={1} adjustsFontSizeToFit>
            {g}
          </Text>
        </Well>
      ))}
    </View>
  );
}
