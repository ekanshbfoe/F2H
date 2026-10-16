import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';

/**
 * Leaving a form that holds unsaved typing asks first, the way iOS does: the back button, a
 * Cancel or Back button, and the edge swipe (switched off while there is something to lose,
 * since a native swipe cannot be paused for a question). Call `release()` right before leaving
 * on purpose, after a save, so that exit is not questioned.
 */
export function useDiscardGuard(dirty: boolean): { release: () => void } {
  const navigation = useNavigation();
  const released = useRef(false);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !dirty });
    if (!dirty) return undefined;
    return navigation.addListener('beforeRemove', (e) => {
      if (released.current) return;
      e.preventDefault();
      Alert.alert('Discard your changes?', 'What you typed here is not saved yet.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(e.data.action),
        },
      ]);
    });
  }, [dirty, navigation]);

  const release = useCallback(() => {
    released.current = true;
  }, []);
  return { release };
}
