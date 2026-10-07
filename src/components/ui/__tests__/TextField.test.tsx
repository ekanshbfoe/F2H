import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import { TextField } from '../TextField';

describe('TextField', () => {
  it('labels the input and forwards changes', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Email" value="" onChangeText={onChangeText} />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.c');
    expect(onChangeText).toHaveBeenCalledWith('a@b.c');
  });

  it('shows the error message', async () => {
    await render(
      <TextField
        label="Confirm password"
        value="x"
        onChangeText={() => undefined}
        error="Passwords do not match"
      />,
    );
    expect(screen.getByText('Passwords do not match')).toBeOnTheScreen();
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    await render(
      <TextField label="Password" value="secret" onChangeText={() => undefined} secure />,
    );
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    await user.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeOnTheScreen();
  });
});
