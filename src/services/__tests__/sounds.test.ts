import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

import { playSound, preloadSounds } from '../sounds';

const create = createAudioPlayer as jest.Mock;

describe('sounds', () => {
  it('respects silent mode, mixes with other audio and alternates two key voices', () => {
    preloadSounds(['key', 'unlock']);
    expect(setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }),
    );
    // two key voices and one unlock voice, created once
    expect(create).toHaveBeenCalledTimes(3);
    const [first, second] = create.mock.results.map((r) => r.value);
    playSound('key');
    playSound('key');
    playSound('key');
    expect(first.play).toHaveBeenCalledTimes(2);
    expect(second.play).toHaveBeenCalledTimes(1);
    expect(first.seekTo).toHaveBeenCalledWith(0);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('stays silent instead of throwing when a player fails', () => {
    const unlock = create.mock.results[2]!.value;
    unlock.play.mockImplementation(() => {
      throw new Error('no audio device');
    });
    expect(() => playSound('unlock')).not.toThrow();
  });
});
