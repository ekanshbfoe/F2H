import { render, screen, userEvent } from '@testing-library/react-native';

import { Button } from '../Button';

describe('Button', () => {
  it('renders its label and fires onPress', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(<Button onPress={onPress}>Approve</Button>);
    await user.press(screen.getByRole('button', { name: 'Approve' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled and exposes the state', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await render(
      <Button onPress={onPress} disabled>
        Approve
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Approve' });
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it('shows a loading indicator and reports busy', async () => {
    await render(
      <Button onPress={() => undefined} loading>
        Approve
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Approve' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(screen.queryByText('Approve')).toBeNull();
  });
});
