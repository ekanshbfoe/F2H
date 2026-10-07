import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/lib/test-utils';

import BootScreen from '../index';

describe('BootScreen', () => {
  it('renders the app name and tagline', async () => {
    await renderWithProviders(<BootScreen />);
    expect(screen.getByRole('header', { name: 'F2H' })).toBeOnTheScreen();
    expect(screen.getByText(/private vault/i)).toBeOnTheScreen();
  });
});
