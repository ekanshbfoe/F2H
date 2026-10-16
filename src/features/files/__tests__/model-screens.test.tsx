// covers: AC-1 (Drive screen states, link outcome parsing), AC-5 (upload ranges, resume parsing),
// AC-10 (files list empty state and badges) of child spec 0001-drive-redundancy
import { screen, userEvent } from '@testing-library/react-native';

import { renderWithProviders } from '@/lib/test-utils';
import { useSession } from '@/state/session.store';

import { parseLinkResult } from '../drive';
import { formatSize, lastByteFromRange, safeName, uploadRanges, UPLOAD_CHUNK } from '../model';
import { DriveScreen } from '../screens/DriveScreen';
import { FilesListScreen } from '../screens/FilesListScreen';
import { useFiles } from '../store';

const mockStatus = jest.fn();
const mockLink = jest.fn();
const mockList = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
    addListener: jest.fn(() => () => undefined),
    dispatch: jest.fn(),
  }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(cb, []);
  },
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/services/functions', () => ({ callFunction: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('@/services/file-adapter', () => ({ clearScratch: jest.fn() }));
jest.mock('../drive', () => ({
  ...jest.requireActual('../drive'),
  listDriveStatus: () => mockStatus(),
  linkSlot: (s: string) => mockLink(s),
}));
jest.mock('../api', () => {
  class FilesError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    FilesError,
    listFiles: () => mockList(),
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
    downloadFile: jest.fn(),
  };
});
jest.mock('expo-linking', () => ({ createURL: () => 'exp://x/--/drive-linked' }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

const admin = {
  id: 'u1',
  email: 'a@x',
  display_name: 'A',
  role: 'admin' as const,
  status: 'active' as const,
};

beforeEach(() => {
  mockStatus.mockReset();
  mockLink.mockReset();
  mockList.mockReset();
  useFiles.getState().clear();
  useSession.setState({ mk: new Uint8Array(32), profile: admin });
});

describe('model helpers', () => {
  it('splits the ciphertext into 1 MiB ranges from any resume point', () => {
    expect(uploadRanges(2 * UPLOAD_CHUNK + 10)).toEqual([
      { start: 0, end: UPLOAD_CHUNK - 1 },
      { start: UPLOAD_CHUNK, end: 2 * UPLOAD_CHUNK - 1 },
      { start: 2 * UPLOAD_CHUNK, end: 2 * UPLOAD_CHUNK + 9 },
    ]);
    expect(uploadRanges(10, 4)).toEqual([{ start: 4, end: 9 }]);
    expect(UPLOAD_CHUNK % (256 * 1024)).toBe(0);
  });

  it('reads the resume answer, sizes and safe names', () => {
    expect(lastByteFromRange('bytes=0-1048575')).toBe(1048575);
    expect(lastByteFromRange(null)).toBe(-1);
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(25 * 1024 * 1024)).toBe('25 MB');
    expect(safeName('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(safeName('   ')).toBe('file');
  });

  it('parses the link return URL', () => {
    expect(parseLinkResult('exp://x/--/drive-linked?slot=a&status=linked')).toBe('linked');
    expect(parseLinkResult('exp://x/--/drive-linked?slot=a&status=cancelled')).toBe('cancelled');
    expect(parseLinkResult('exp://x/--/drive-linked?slot=a&status=failed')).toBe('failed');
    expect(parseLinkResult(null)).toBe('cancelled');
  });
});

describe('DriveScreen (AC-1, AC-2)', () => {
  it('shows a linked slot, a slot needing relinking, and links on tap', async () => {
    mockStatus.mockResolvedValue([
      {
        slot: 'a',
        google_email: 'admin@gmail.com',
        status: 'active',
        bytes_used: 2048,
        linked_at: 'now',
      },
    ]);
    mockLink.mockResolvedValue('linked');
    await renderWithProviders(<DriveScreen />);
    expect(await screen.findByText('admin@gmail.com')).toBeOnTheScreen();
    expect(screen.getByText('Not linked')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByTestId('drive-link-b'));
    expect(mockLink).toHaveBeenCalledWith('b');
    expect(await screen.findByText('Drive B is linked.')).toBeOnTheScreen();
  });

  it('flags a slot that needs linking again', async () => {
    mockStatus.mockResolvedValue([
      {
        slot: 'b',
        google_email: 'father@gmail.com',
        status: 'needs_relink',
        bytes_used: 0,
        linked_at: 'now',
      },
    ]);
    await renderWithProviders(<DriveScreen />);
    expect(await screen.findByText('Needs linking again')).toBeOnTheScreen();
  });

  it('refuses members', async () => {
    useSession.setState({ profile: { ...admin, role: 'member' } });
    await renderWithProviders(<DriveScreen />);
    expect(screen.getByText('Only the Admin links the family Drives.')).toBeOnTheScreen();
  });
});

describe('FilesListScreen (AC-10)', () => {
  it('shows the empty state', async () => {
    mockList.mockResolvedValue({ items: [], states: {}, skipped: 0 });
    await renderWithProviders(<FilesListScreen />);
    expect(await screen.findByTestId('files-empty')).toBeOnTheScreen();
  });

  it('lists files newest first with the one copy badge', async () => {
    const f = (id: string, name: string, at: string) => ({
      id,
      version: 1,
      payload: {
        v: 1 as const,
        type: 'file' as const,
        name,
        mime: 'application/pdf',
        size: 2048,
        blob_id: 'a'.repeat(32),
        sha256_ct: 'b'.repeat(64),
        size_ct: 2200,
        chunk_size: 1048576,
        total_chunks: 1,
        added_at: at,
      },
    });
    mockList.mockResolvedValue({
      items: [f('1', 'old.pdf', '2026-01-01T00:00:00Z'), f('2', 'new.pdf', '2026-10-01T00:00:00Z')],
      states: { '1': 'ok', '2': 'degraded' },
      skipped: 0,
    });
    await renderWithProviders(<FilesListScreen />);
    expect(await screen.findByText('new.pdf')).toBeOnTheScreen();
    expect(screen.getByText('One copy')).toBeOnTheScreen();
    const rows = screen.getAllByTestId(/^file-row-/).map((r) => r.props.testID);
    expect(rows).toEqual(['file-row-2', 'file-row-1']);
  });
});
