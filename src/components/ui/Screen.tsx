import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface ScreenProps extends ViewProps {
  /** One title per screen (design mandate). Omit when the screen draws its own header. */
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Pinned under the scroll area (usually the primary Button). */
  footer?: ReactNode;
  /** Draws nothing above the content; the screen owns its header band. */
  bare?: boolean;
}

/** Canvas background, safe area, 20 px gutters, `spacing.lg` rhythm, keyboard aware. */
export function Screen({
  title,
  subtitle,
  children,
  footer,
  bare = false,
  style,
  ...rest
}: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: t.colors.canvas }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          {
            paddingTop: bare ? 0 : insets.top + t.spacing.xl,
            paddingBottom: t.spacing.xxl,
            paddingHorizontal: bare ? 0 : t.sizes.sheetInset,
            gap: t.spacing.lg,
          },
          style,
        ]}
        {...rest}
      >
        {title ? (
          <View style={{ gap: t.spacing.xs }}>
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text variant="body" color="muted">
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            paddingHorizontal: t.sizes.sheetInset,
            paddingTop: t.spacing.md,
            paddingBottom: insets.bottom + t.spacing.lg,
            backgroundColor: t.colors.canvas,
            gap: t.spacing.sm,
          }}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
