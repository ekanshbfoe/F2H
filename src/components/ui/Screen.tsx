import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
  type ViewProps,
} from 'react-native';
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
  /**
   * The back chevron beside the title. Shown by default whenever there is a screen to go back
   * to, so no pushed screen strands an iPhone without a way back; `false` hides it.
   */
  back?: boolean;
}

/** Whether the stack has a screen under this one (false outside a navigator, as in a test). */
function useCanGoBack(): { canGoBack: boolean; goBack: () => void } {
  const router = useRouter();
  let canGoBack = false;
  try {
    canGoBack = typeof router?.canGoBack === 'function' && router.canGoBack();
  } catch {
    canGoBack = false;
  }
  return { canGoBack, goBack: () => router.back() };
}

/** Canvas background, safe area, 20 px gutters, `spacing.lg` rhythm, keyboard aware. */
export function Screen({
  title,
  subtitle,
  children,
  footer,
  bare = false,
  back = true,
  style,
  ...rest
}: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { canGoBack, goBack } = useCanGoBack();
  const showBack = back && canGoBack;
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
              {showBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  onPress={goBack}
                  hitSlop={t.spacing.md}
                  testID="screen-back"
                  style={{ marginLeft: -t.spacing.xs }}
                >
                  <Ionicons name="chevron-back" size={t.sizes.iconLg} color={t.colors.sky} />
                </Pressable>
              ) : null}
              <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
                {title}
              </Text>
            </View>
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
