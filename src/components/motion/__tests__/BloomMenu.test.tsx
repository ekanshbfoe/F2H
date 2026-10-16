import { screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { renderWithProviders } from '@/lib/test-utils';

import { BloomMenu } from '../BloomMenu';

function Harness({ onShare }: { onShare: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <BloomMenu
      open={open}
      onOpenChange={setOpen}
      rows={[{ key: 'size', label: 'Size', value: '155 KB' }]}
      actions={[{ key: 'share', icon: 'share-outline', label: 'Share', onPress: onShare }]}
      testID="bloom"
    />
  );
}

describe('BloomMenu', () => {
  it('shows nothing but the corner button until it is opened', async () => {
    await renderWithProviders(<Harness onShare={jest.fn()} />);
    expect(screen.queryByText('155 KB')).toBeNull();
    expect(screen.getByTestId('bloom-toggle')).toBeCollapsed();
  });

  it('blooms the rows and actions out of the button', async () => {
    const onShare = jest.fn();
    const user = userEvent.setup();
    await renderWithProviders(<Harness onShare={onShare} />);
    await user.press(screen.getByTestId('bloom-toggle'));
    expect(screen.getByText('Size')).toBeOnTheScreen();
    expect(screen.getByText('155 KB')).toBeOnTheScreen();
    await user.press(screen.getByTestId('bloom-share'));
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('closes from a tap outside the rows', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<Harness onShare={jest.fn()} />);
    await user.press(screen.getByTestId('bloom-toggle'));
    await user.press(screen.getByLabelText('Close details'));
    expect(screen.getByTestId('bloom-toggle')).toBeCollapsed();
  });
});
