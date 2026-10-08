// covers: AC-2 (the gate renders over everything), AC-4 (countdown copy), AC-6 (forgot PIN asks first)
import { fireEvent, screen, userEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { renderWithProviders } from '@/lib/test-utils';

import { useLock } from '../lock.store';
import { UnlockScreen } from '../screens/UnlockScreen';

const mockUnlock = jest.fn();
const mockWipe = jest.fn(async (_reason: string) => undefined);

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => undefined) }));
jest.mock('@/services/supabase', () => ({ setForbiddenHandler: jest.fn() }));
jest.mock('../api', () => ({
  unlock: (pin: string) => mockUnlock(pin),
  wipe: (reason: string) => mockWipe(reason),
  endCooldown: jest.fn(async () => undefined),
  persistCooldown: jest.fn(async () => undefined),
}));

beforeEach(() => {
  mockUnlock.mockReset();
  mockWipe.mockClear();
  useLock.setState({
    state: 'locked',
    generation: 0,
    failures: 0,
    cooldownMs: 0,
    cooldownStartedAt: 0,
    busy: false,
  });
});

describe('UnlockScreen', () => {
  it('sends six digits to unlock and shows the miss copy', async () => {
    mockUnlock.mockResolvedValue({ kind: 'wrong_pin', failures: 6 });
    await renderWithProviders(<UnlockScreen />);
    expect(screen.getByRole('header', { name: 'Enter your PIN' })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('unlock-input'), '000000');
    expect(await screen.findByText(/4 tries left before this phone wipes/)).toBeOnTheScreen();
    expect(mockUnlock).toHaveBeenCalledWith('000000');
    expect(screen.getByLabelText('0 of 6 digits entered')).toBeOnTheScreen();
  });

  it('shows the countdown and blocks the pad while cooling down (AC-4)', async () => {
    useLock.setState({
      state: 'cooling_down',
      cooldownMs: 30_000,
      cooldownStartedAt: performance.now(),
      failures: 5,
    });
    await renderWithProviders(<UnlockScreen />);
    expect(screen.getByRole('header', { name: 'Locked for now' })).toBeOnTheScreen();
    expect(screen.getByText(/Try again in 0:(30|29)/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
    expect(mockUnlock).not.toHaveBeenCalled();
  });

  it('asks before a forgot PIN wipe and wipes on confirm (AC-6)', async () => {
    const user = userEvent.setup();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const wipeButton = buttons?.find((b) => b.style === 'destructive');
      wipeButton?.onPress?.();
    });
    await renderWithProviders(<UnlockScreen />);
    await user.press(screen.getByRole('button', { name: 'Forgot your PIN?' }));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(mockWipe).toHaveBeenCalledWith('forgot');
    alert.mockRestore();
  });
});
