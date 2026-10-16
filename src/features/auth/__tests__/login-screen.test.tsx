// covers: AC-1 (the toggle, on device validation before any request, error banner copy)
import { fireEvent, screen } from '@testing-library/react-native';
import LoginScreen from '@/app/(auth)/login';
import { renderWithProviders } from '@/lib/test-utils';

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
    addListener: jest.fn(() => () => undefined),
    dispatch: jest.fn(),
  }),
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/features/auth/api', () => ({
  signIn: (...a: unknown[]) => mockSignIn(...a),
  signUp: (...a: unknown[]) => mockSignUp(...a),
  fetchRecoveryPubkey: jest.fn(async () => ({
    recovery_pub: 'x',
    fingerprint: 'ab12 cd34 ef56 7890',
  })),
}));
jest.mock('@/features/auth/diagnostics', () => ({
  runConnectionCheck: jest.fn(async () => []),
  formatConnectionCheck: () => '',
}));
jest.mock('@/services/device-info', () => ({
  getDeviceInfo: () => ({ model: 'Pixel', os: 'Android', app_version: '0.1.0', name: 'My Pixel' }),
}));

// fireEvent returns a promise in this Testing Library version; awaiting it settles the handlers.
const type = (testID: string, text: string) =>
  fireEvent.changeText(screen.getByTestId(testID), text);
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));

beforeEach(() => {
  mockSignIn.mockReset();
  mockSignUp.mockReset();
  mockReplace.mockClear();
});

describe('Login / Sign up screen', () => {
  it('blocks an invalid email and a short password on device', async () => {
    await renderWithProviders(<LoginScreen />);
    await type('login-email', 'nope');
    await type('login-password', 'short');
    await press('auth-submit');
    expect(await screen.findByText('Enter a valid email address')).toBeOnTheScreen();
    expect(screen.getByText('Use at least 10 characters')).toBeOnTheScreen();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('submits a valid login and routes to the resolved screen', async () => {
    mockSignIn.mockResolvedValue('waiting');
    await renderWithProviders(<LoginScreen />);
    await type('login-email', 'Father@Example.com');
    await type('login-password', 'correct horse battery');
    await press('auth-submit');
    expect(mockSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'father@example.com', password: 'correct horse battery' }),
    );
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/waiting');
  });

  it('shows the exact failure in a banner when login fails', async () => {
    mockSignIn.mockRejectedValue({
      code: 'auth_unreachable',
      message: 'Supabase Auth signInWithPassword: status 422, Email logins are disabled',
    });
    await renderWithProviders(<LoginScreen />);
    await type('login-email', 'father@example.com');
    await type('login-password', 'correct horse battery');
    await press('auth-submit');
    expect(await screen.findByText(/status 422, Email logins are disabled/)).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('sign up mode shows the invite field and the Admin fingerprint, and blocks a mismatched confirm', async () => {
    await renderWithProviders(<LoginScreen />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Sign up' }));
    expect(await screen.findByText(/ab12 cd34 ef56 7890/)).toBeOnTheScreen();
    await type('signup-name', 'Brother');
    await type('signup-email', 'brother@example.com');
    await type('signup-invite', 'ab12cd34');
    await type('signup-password', 'correct horse battery');
    await type('signup-confirm', 'something else');
    await press('auth-submit');
    expect(await screen.findByText('Passwords do not match')).toBeOnTheScreen();
    expect(mockSignUp).not.toHaveBeenCalled();
  });
});
