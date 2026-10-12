import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardDeck } from '@/components/motion';
import { Text } from '@/components/ui';
import { pathFor } from '@/features/auth/routes';
import { useTheme } from '@/theme';

import { CARDS, markOnboarded, type OnboardingCard } from '../model';

/**
 * First launch (spec 0007, AC-2, AC-3): drag each card left or right; the last one opens login.
 * The warm title colours sit on charcoal cards so orange, yellow and red all keep their contrast.
 * This is the only screen that uses the warm palette.
 */
export function OnboardingScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [seen, setSeen] = useState(0);

  const finish = () => {
    void markOnboarded()
      .catch(() => undefined)
      .finally(() => router.replace(pathFor('login')));
  };

  const renderCard = (card: OnboardingCard, index: number) => (
    <View
      style={{
        flex: 1,
        borderRadius: t.radii.xxl,
        backgroundColor: t.colors.charcoal,
        padding: t.spacing.xxl,
        gap: t.spacing.lg,
        justifyContent: 'center',
        ...t.shadows.raised,
      }}
      accessible
      accessibilityLabel={`${card.title}. ${card.body}`}
      accessibilityHint={
        index < CARDS.length - 1
          ? 'Drag left or right for the next card'
          : 'Drag left or right to log in'
      }
      testID={`onboarding-card-${card.key}`}
    >
      <Ionicons name={card.icon} size={t.sizes.hero / 2.5} color={t.colors[card.tone]} />
      <Text variant="display" style={{ color: t.colors[card.tone] }}>
        {card.title}
      </Text>
      <Text variant="body" style={{ color: t.colors.surface }}>
        {card.body}
      </Text>
      <Text variant="caption" style={{ color: t.colors.lineStrong }}>
        {`${index + 1} of ${CARDS.length}`}
      </Text>
    </View>
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.canvas,
        paddingTop: insets.top + t.spacing.lg,
        paddingBottom: insets.bottom + t.spacing.xl,
        paddingHorizontal: t.sizes.sheetInset,
        gap: t.spacing.xl,
      }}
      testID="onboarding"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        <Image
          source={require('../../../../assets/images/splash-icon.png')}
          accessibilityLabel="F2H bear mascot"
          style={{ width: t.sizes.avatar, height: t.sizes.avatar, borderRadius: t.radii.md }}
        />
        <Text variant="heading" style={{ flex: 1 }} accessibilityRole="header">
          Welcome to F2H
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip the introduction"
          onPress={finish}
          hitSlop={12}
          style={{ minHeight: t.sizes.touch, justifyContent: 'center' }}
          testID="onboarding-skip"
        >
          <Text variant="label" color="primary">
            Skip
          </Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, justifyContent: 'center' }}>
        <CardDeck
          cards={CARDS}
          keyOf={(c) => c.key}
          renderCard={renderCard}
          onSwipe={() => setSeen((n) => n + 1)}
          onEmpty={finish}
          height={440}
          testID="onboarding-deck"
        />
      </View>

      <View
        style={{ flexDirection: 'row', justifyContent: 'center', gap: t.spacing.sm }}
        accessible
        accessibilityLabel={`Card ${Math.min(seen + 1, CARDS.length)} of ${CARDS.length}`}
      >
        {CARDS.map((c, i) => (
          <View
            key={c.key}
            style={{
              width: i === seen ? t.spacing.xl : t.spacing.sm,
              height: t.spacing.sm,
              borderRadius: t.radii.pill,
              backgroundColor: i === seen ? t.colors[c.tone] : t.colors.lineStrong,
            }}
          />
        ))}
      </View>
      <Text variant="caption" color="muted" align="center">
        Drag the card left or right
      </Text>
    </View>
  );
}
