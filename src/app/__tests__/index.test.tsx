import { render, screen } from '@testing-library/react-native';

import BootScreen from '../index';

describe('BootScreen', () => {
  it('renders the app name', async () => {
    await render(<BootScreen />);
    expect(screen.getByText('F2H')).toBeOnTheScreen();
  });
});
