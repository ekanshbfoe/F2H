import { Image, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useTheme } from '@/theme';

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;

/**
 * A photo that fits its box and zooms: pinch, drag while zoomed, double tap to zoom in or back
 * out. Everything runs on the UI thread. Android decodes it at the box size, not the photo's
 * full size, so a 12 MP photo does not take 48 MB on a 1 GB phone.
 */
export function ZoomImage({ uri, label }: { uri: string; label: string }) {
  const t = useTheme();
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  // a plain copy: gesture callbacks copy what they close over to the UI thread
  const settle = t.motion.springSnappy;

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.set(scale.get());
    })
    .onUpdate((e) => {
      scale.set(Math.min(MAX_ZOOM, Math.max(0.8, startScale.get() * e.scale)));
    })
    .onEnd(() => {
      if (scale.get() <= 1) {
        scale.set(withSpring(1, settle));
        x.set(withSpring(0, settle));
        y.set(withSpring(0, settle));
      }
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      startX.set(x.get());
      startY.set(y.get());
    })
    .onUpdate((e) => {
      const s = scale.get();
      if (s <= 1) return;
      // keep the photo's edge from coming inside the box
      const maxX = (w.get() * (s - 1)) / 2;
      const maxY = (h.get() * (s - 1)) / 2;
      x.set(Math.min(maxX, Math.max(-maxX, startX.get() + e.translationX)));
      y.set(Math.min(maxY, Math.max(-maxY, startY.get() + e.translationY)));
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomIn = scale.get() <= 1;
      scale.set(withSpring(zoomIn ? DOUBLE_TAP_ZOOM : 1, settle));
      x.set(withSpring(0, settle));
      y.set(withSpring(0, settle));
    });

  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[StyleSheet.absoluteFill, style]}
        onLayout={(e) => {
          w.set(e.nativeEvent.layout.width);
          h.set(e.nativeEvent.layout.height);
        }}
      >
        <Image
          source={{ uri }}
          resizeMode="contain"
          resizeMethod="resize"
          accessibilityRole="image"
          accessibilityLabel={label}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </GestureDetector>
  );
}
