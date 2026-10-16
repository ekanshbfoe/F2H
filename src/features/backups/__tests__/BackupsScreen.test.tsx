// covers: AC-5 of spec 0006 (the Backups screen: list, per Drive status, Back up now, Admin only)
import { screen, userEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/lib/test-utils';
import { useSession } from '@/state/session.store';

import { BackupsScreen } from '../screens/BackupsScreen';

const mockList = jest.fn();
const mockRun = jest.fn();
jest.mock('../api', () => ({ listBackups: () => mockList(), backUpNow: () => mockRun() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useNavigation: () => ({
    setOptions: jest.fn(),
    addListener: jest.fn(() => () => undefined),
    dispatch: jest.fn(),
  }),
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(cb, []);
  },
}));

const admin = {
  id: 'a',
  email: 'a@x',
  display_name: 'A',
  role: 'admin' as const,
  status: 'active' as const,
};

beforeEach(() => {
  mockList.mockReset();
  mockRun.mockReset();
  useSession.setState({ profile: admin });
});

describe('BackupsScreen', () => {
  it('lists snapshots with their Drive status', async () => {
    mockList.mockResolvedValue([
      {
        id: 'b1',
        taken_at: '2026-10-12T03:00:00Z',
        size: 14359,
        state: 'ok',
        drive_a_file_id: 'x',
        drive_b_file_id: 'y',
      },
      {
        id: 'b2',
        taken_at: '2026-10-11T03:00:00Z',
        size: 14000,
        state: 'degraded',
        drive_a_file_id: 'x',
        drive_b_file_id: null,
      },
    ]);
    await renderWithProviders(<BackupsScreen />);
    expect(await screen.findByText('Both Drives')).toBeOnTheScreen();
    expect(screen.getByText('One Drive')).toBeOnTheScreen();
    expect(screen.getByText(/14 KB · Drive A yes · Drive B yes/)).toBeOnTheScreen();
  });

  it('runs a backup now and explains a missing Drive', async () => {
    mockList.mockResolvedValue([]);
    mockRun.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'no_drive_linked' }));
    await renderWithProviders(<BackupsScreen />);
    expect(await screen.findByTestId('backups-empty')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByTestId('backups-run'));
    expect(await screen.findByText(/No Google Drive is linked yet/)).toBeOnTheScreen();
    mockRun.mockResolvedValueOnce({ backup_id: 'n', state: 'ok', size: 2048 });
    await userEvent.setup().press(screen.getByTestId('backups-run'));
    expect(await screen.findByText('Backup saved on both Drives (2.0 KB).')).toBeOnTheScreen();
  });

  it('refuses members', async () => {
    useSession.setState({ profile: { ...admin, role: 'member' } });
    await renderWithProviders(<BackupsScreen />);
    expect(screen.getByText('Only the Admin manages backups.')).toBeOnTheScreen();
    expect(mockList).not.toHaveBeenCalled();
  });
});
