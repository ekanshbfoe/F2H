// covers: AC-2, AC-3, AC-4, AC-6 of spec 0007 (the deck, Skip, the flag, and the Home counts)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen, userEvent, waitFor } from '@testing-library/react-native';

import HomeScreen from '@/app/(app)/home';
import { useContacts } from '@/features/contacts/store';
import { useCredentials } from '@/features/credentials/store';
import { useFiles } from '@/features/files/store';
import { renderWithProviders } from '@/lib/test-utils';
import { useSession } from '@/state/session.store';

import { CARDS, hasOnboarded, markOnboarded } from '../model';
import { OnboardingScreen } from '../screens/OnboardingScreen';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
    addListener: jest.fn(() => () => undefined),
    dispatch: jest.fn(),
  }),
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {}, setForbiddenHandler: jest.fn() }));
jest.mock('@/services/functions', () => ({ callFunction: jest.fn() }));
jest.mock('@/services/file-adapter', () => ({ clearScratch: jest.fn() }));
jest.mock('@/features/admin/api', () => ({
  listPendingDevices: jest.fn(async () => []),
  subscribePendingDevices: () => () => undefined,
}));
jest.mock('@/features/auth/api', () => ({ signOut: jest.fn(async () => undefined) }));
jest.mock('@/features/lock/api', () => ({ lockNow: jest.fn() }));

beforeEach(async () => {
  mockReplace.mockClear();
  await AsyncStorage.clear();
});

describe('onboarding flag (AC-3)', () => {
  it('is absent on a new phone and set once finished', async () => {
    await expect(hasOnboarded()).resolves.toBe(false);
    await markOnboarded();
    await expect(hasOnboarded()).resolves.toBe(true);
  });
});

describe('OnboardingScreen (AC-2)', () => {
  it('shows the four cards in order, starting with the first, in warm colours', async () => {
    expect(CARDS.map((c) => c.title)).toEqual([
      "Your family's vault",
      'Encrypted before it leaves your phone',
      'The Admin approves every phone',
      'Kept on two Google Drives',
    ]);
    expect(new Set(CARDS.map((c) => c.tone))).toEqual(
      new Set(['warmOrange', 'warmRed', 'warmYellow']),
    );
    await renderWithProviders(<OnboardingScreen />);
    expect(screen.getByTestId('onboarding-card-vault')).toBeOnTheScreen();
    expect(screen.getByLabelText('Card 1 of 4')).toBeOnTheScreen();
  });

  it('Skip stores the flag and opens login', async () => {
    await renderWithProviders(<OnboardingScreen />);
    await userEvent.setup().press(screen.getByTestId('onboarding-skip'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/login'));
    await expect(hasOnboarded()).resolves.toBe(true);
  });
});

describe('Home vault counts (AC-4)', () => {
  it('shows counts only for lists that loaded on this phone', async () => {
    useSession.setState({
      profile: { id: 'm', email: 'm@x', display_name: 'Bhai', role: 'member', status: 'active' },
      mk: new Uint8Array(32),
    });
    useContacts.setState({
      status: 'ready',
      items: { a: {} as never, b: {} as never },
    });
    useCredentials.setState({ status: 'idle', items: {} });
    useFiles.setState({ status: 'ready', items: {} });
    await renderWithProviders(<HomeScreen />);
    expect(screen.getByText('2 saved')).toBeOnTheScreen();
    expect(screen.getByText('Bank, email and more')).toBeOnTheScreen();
    expect(screen.getByText('0 saved')).toBeOnTheScreen();
  });
});
