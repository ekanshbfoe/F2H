import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * A decrypted video with the phone's own controls; it waits for a tap to play. No fullscreen:
 * Android plays that in a separate screen without the screenshot block or the lock clock.
 */
export function VideoPreview({ uri, label }: { uri: string; label: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls
      fullscreenOptions={{ enable: false }}
      allowsPictureInPicture={false}
      accessibilityLabel={label}
      testID="file-video"
    />
  );
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A decrypted recording or song: play and pause, the time, and how far along it is. */
export function AudioPreview({ uri, name }: { uri: string; name: string }) {
  const t = useTheme();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const share = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;

  // no pause on close: useAudioPlayer releases the player as the sheet closes, which stops it,
  // and a pause after that release would touch a freed player

  const toggle = () => {
    if (playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) {
      void player.seekTo(0);
    }
    player.play();
  };

  return (
    <View
      style={[styles.center, { gap: t.spacing.lg, padding: t.spacing.xl, alignSelf: 'stretch' }]}
    >
      <Ionicons name="musical-notes-outline" size={t.sizes.hero / 2} color={t.colors.primary} />
      <Text variant="heading" align="center" numberOfLines={2}>
        {name}
      </Text>
      <View style={{ alignSelf: 'stretch', gap: t.spacing.xs }}>
        <View
          style={{
            height: t.sizes.progress,
            borderRadius: t.radii.pill,
            backgroundColor: t.colors.line,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${share * 100}%`,
              height: '100%',
              backgroundColor: t.colors.primary,
            }}
          />
        </View>
        <View style={styles.times}>
          <Text variant="caption" color="muted">
            {clock(status.currentTime)}
          </Text>
          <Text variant="caption" color="muted">
            {clock(status.duration)}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : 'Play'}
        onPress={toggle}
        testID="file-audio-toggle"
        style={({ pressed }) => [
          t.shadows.floating,
          styles.center,
          {
            width: t.sizes.buttonHeight + t.spacing.lg,
            height: t.sizes.buttonHeight + t.spacing.lg,
            borderRadius: t.radii.pill,
            backgroundColor: pressed ? t.colors.primaryDark : t.colors.primary,
          },
        ]}
      >
        <Ionicons
          name={playing ? 'pause' : 'play'}
          size={t.sizes.iconLg}
          color={t.colors.onPrimary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
});
