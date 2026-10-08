import { router } from 'expo-router';
import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { useAppStateStatus, useAutoLock, useRevokeGuard, useScreenCaptureBlock } from './hooks';
import { useLock } from './lock.store';
import { UnlockScreen } from './screens/UnlockScreen';

/**
 * Mounted once in the root layout, inside the providers: the Unlock overlay, the auto lock, the
 * revoke guard, the Android screenshot block, the privacy overlay and the wiped navigation.
 */
export function LockRuntime() {
  const state = useLock((s) => s.state);
  useAutoLock();
  useRevokeGuard();
  useScreenCaptureBlock();

  useEffect(
    () =>
      useLock.subscribe((s, prev) => {
        if (s.state === 'wiped' && prev.state !== 'wiped') {
          router.replace({
            pathname: '/(lock)/wiped',
            params: { reason: s.wipeReason ?? 'pin_limit' },
          });
        }
      }),
    [],
  );

  return (
    <>
      {state === 'locked' || state === 'cooling_down' ? <UnlockScreen /> : null}
      <PrivacyOverlay />
    </>
  );
}

/** Covers everything while the app is not active: the app switcher sees only the mascot (AC-9). */
function PrivacyOverlay() {
  const t = useTheme();
  const status = useAppStateStatus();
  if (status === 'active') return null;
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: t.colors.canvas,
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.spacing.md,
        },
      ]}
      testID="privacy-overlay"
    >
      <Image
        source={require('../../../assets/images/splash-icon.png')}
        accessibilityLabel="F2H"
        style={{ width: t.sizes.hero, height: t.sizes.hero, borderRadius: t.radii.xl }}
      />
      <Text variant="display" color="primary">
        F2H
      </Text>
    </View>
  );
}
