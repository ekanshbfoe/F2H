import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * UI sound cues (made by `scripts/make-sounds.py`). Each is a short WAV held in a player that is
 * created once and kept: three tiny players cost almost nothing, and keeping them means the
 * unlock chime is never cut off when the gate that played it unmounts.
 *
 * The phone decides whether we are heard: silent or vibrate mode mutes every cue, and the cues
 * mix with whatever is already playing instead of pausing someone's music.
 */
const SOURCES = {
  key: require('../../assets/sounds/key.wav'),
  unlock: require('../../assets/sounds/unlock.wav'),
} as const;

export type SoundCue = keyof typeof SOURCES;

/** Two key players take turns, so a fast second tap never cuts the first one off. */
const VOICES: Record<SoundCue, number> = { key: 2, unlock: 1 };

const players: Partial<Record<SoundCue, AudioPlayer[]>> = {};
const turn: Partial<Record<SoundCue, number>> = {};
let moded = false;

function voices(cue: SoundCue): AudioPlayer[] {
  if (!moded) {
    moded = true;
    setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
    }).catch(() => undefined);
  }
  let list = players[cue];
  if (!list) {
    list = Array.from({ length: VOICES[cue] }, () => createAudioPlayer(SOURCES[cue]));
    players[cue] = list;
  }
  return list;
}

/** Loads the players ahead of the first tap, so that tap is not the one that waits. */
export function preloadSounds(cues: SoundCue[]): void {
  try {
    cues.forEach(voices);
  } catch {
    // no audio on this phone: every cue stays silent
  }
}

/** Plays a cue from the start. Sound is a garnish: any failure is silent. */
export function playSound(cue: SoundCue): void {
  try {
    const list = voices(cue);
    const i = (turn[cue] ?? 0) % list.length;
    turn[cue] = i + 1;
    const player = list[i]!;
    player.seekTo(0).catch(() => undefined);
    player.play();
  } catch {
    // ignore: the visual and the haptic already carry the feedback
  }
}
