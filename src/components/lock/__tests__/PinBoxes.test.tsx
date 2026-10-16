// covers: AC-11 (announced count), plus one result cue per wrong or right PIN
import { render, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { playSound } from '@/services/sounds';

import { PinBoxes } from '../PinBoxes';

jest.mock('@/services/sounds', () => ({ playSound: jest.fn(), preloadSounds: jest.fn() }));

describe('PinBoxes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('announces how many digits are in and never shows them', async () => {
    await render(<PinBoxes value="481" />);
    expect(screen.getByLabelText('3 of 6 digits entered')).toBeTruthy();
    expect(screen.queryByText('4')).toBeNull();
  });

  it('fires one error haptic when the PIN is wrong and no sound', async () => {
    const { rerender } = await render(<PinBoxes value="123456" />);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    await rerender(<PinBoxes value="123456" state="error" />);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith('error');
    await rerender(<PinBoxes value="123456" state="error" />);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(playSound).not.toHaveBeenCalled();
  });

  it('plays the chime at once, lands the success haptic, then reports the sequence done', async () => {
    const done = jest.fn();
    const { rerender } = await render(
      <PinBoxes value="123456" state="checking" onSuccessDone={done} />,
    );
    expect(playSound).not.toHaveBeenCalled();
    await rerender(<PinBoxes value="123456" state="success" onSuccessDone={done} />);
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith('unlock');
    expect(screen.getByLabelText('PIN accepted')).toBeTruthy();
    await waitFor(() => expect(Haptics.notificationAsync).toHaveBeenLastCalledWith('success'));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await rerender(<PinBoxes value="123456" state="success" onSuccessDone={done} />);
    expect(playSound).toHaveBeenCalledTimes(1);
  });
});
