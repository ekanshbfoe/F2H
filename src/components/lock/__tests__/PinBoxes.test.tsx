// covers: AC-11 (announced count), plus one result haptic per wrong or right PIN
import { render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { PinBoxes } from '../PinBoxes';

describe('PinBoxes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('announces how many digits are in and never shows them', async () => {
    await render(<PinBoxes value="481" />);
    expect(screen.getByLabelText('3 of 6 digits entered')).toBeTruthy();
    expect(screen.queryByText('4')).toBeNull();
  });

  it('fires one error haptic when the PIN is wrong and one success haptic when right', async () => {
    const { rerender } = await render(<PinBoxes value="123456" />);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    await rerender(<PinBoxes value="123456" state="error" />);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith('error');
    await rerender(<PinBoxes value="123456" state="error" />);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    await rerender(<PinBoxes value="123456" state="success" />);
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith('success');
  });
});
