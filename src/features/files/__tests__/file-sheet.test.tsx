// covers: AC-9, AC-11 of child spec 0001-drive-redundancy (open after a hash check, delete),
// through the sheet the files list opens a file in
import { act, screen, userEvent } from '@testing-library/react-native';

import { ConfirmHost } from '@/components/ui';
import { renderWithProviders } from '@/lib/test-utils';
import { useSession } from '@/state/session.store';

import { previewKind, typeLabel, type StoredFile } from '../model';
import { FilesListScreen } from '../screens/FilesListScreen';
import { useFiles } from '../store';

const mockList = jest.fn();
const mockDownload = jest.fn();
const mockDelete = jest.fn();
const mockOpenWith = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(cb, []);
  },
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/services/functions', () => ({ callFunction: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(() => Promise.resolve()),
  allowScreenCaptureAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/services/file-adapter', () => ({ clearScratch: jest.fn(), fileExists: () => true }));
jest.mock('expo-file-system', () => ({
  File: class {
    text() {
      return Promise.resolve('wifi password is on the fridge');
    }
  },
}));
jest.mock('../open-with', () => ({
  openWith: (uri: string, mime: string) => mockOpenWith(uri, mime),
  share: jest.fn(),
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
    deleteFile: (id: string) => mockDelete(id),
    downloadFile: (f: StoredFile) => mockDownload(f),
  };
});

const file = (id: string, name: string, mime: string, size = 2048): StoredFile => ({
  id,
  version: 1,
  payload: {
    v: 1,
    type: 'file',
    name,
    mime,
    size,
    blob_id: 'a'.repeat(32),
    sha256_ct: 'b'.repeat(64),
    size_ct: size + 100,
    chunk_size: 1048576,
    total_chunks: 1,
    added_at: '2026-10-16T12:31:30Z',
  },
});

const member = {
  id: 'u1',
  email: 'a@x',
  display_name: 'A',
  role: 'member' as const,
  status: 'active' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  useFiles.getState().clear();
  useSession.setState({ mk: new Uint8Array(32), profile: member });
  mockDownload.mockResolvedValue('file:///cache/f2h-open/x');
  mockOpenWith.mockResolvedValue(true);
});

async function openRow(id: string) {
  const user = userEvent.setup();
  await user.press(await screen.findByTestId(`file-row-${id}`));
  return user;
}

describe('preview helpers', () => {
  it('previews photos and short text, and sends the rest to another app', () => {
    expect(previewKind({ mime: 'image/png', size: 1000 })).toBe('image');
    expect(previewKind({ mime: 'image/heic', size: 1000 })).toBe('other');
    expect(previewKind({ mime: 'image/jpeg', size: 30 * 1024 * 1024 })).toBe('other');
    expect(previewKind({ mime: 'text/plain', size: 1000 })).toBe('text');
    expect(previewKind({ mime: 'text/plain', size: 1024 * 1024 })).toBe('other');
    expect(previewKind({ mime: 'application/pdf', size: 1000 })).toBe('other');
  });

  it('names the type the way a person says it', () => {
    expect(typeLabel('image/png')).toBe('PNG image');
    expect(typeLabel('application/pdf')).toBe('PDF document');
    expect(typeLabel('application/x-rar-compressed')).toBe('RAR file');
    expect(typeLabel('application/octet-stream')).toBe('File');
  });
});

describe('the file sheet', () => {
  it('opens over the list and shows short text in place', async () => {
    mockList.mockResolvedValue({
      items: [file('1', 'notes.txt', 'text/plain')],
      states: { '1': 'ok' },
      skipped: 0,
    });
    await renderWithProviders(
      <>
        <FilesListScreen />
        <ConfirmHost />
      </>,
    );
    await openRow('1');
    expect(await screen.findByText('wifi password is on the fridge')).toBeOnTheScreen();
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('does not decrypt a PDF until asked, then opens it in another app', async () => {
    mockList.mockResolvedValue({
      items: [file('1', 'lease.pdf', 'application/pdf')],
      states: { '1': 'degraded' },
      skipped: 0,
    });
    await renderWithProviders(
      <>
        <FilesListScreen />
        <ConfirmHost />
      </>,
    );
    const user = await openRow('1');
    expect(await screen.findByText('PDF document · 2.0 KB')).toBeOnTheScreen();
    expect(mockDownload).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('file-open'));
    expect(mockOpenWith).toHaveBeenCalledWith('file:///cache/f2h-open/x', 'application/pdf');
  });

  it('blooms the details and deletes after a confirm', async () => {
    mockList.mockResolvedValue({
      items: [file('1', 'lease.pdf', 'application/pdf')],
      states: { '1': 'degraded' },
      skipped: 0,
    });
    mockDelete.mockResolvedValue(undefined);
    await renderWithProviders(
      <>
        <FilesListScreen />
        <ConfirmHost />
      </>,
    );
    const user = await openRow('1');
    await user.press(await screen.findByTestId('file-menu-toggle'));
    expect(screen.getByText('One Drive')).toBeOnTheScreen();
    await user.press(screen.getByTestId('file-menu-delete'));
    expect(await screen.findByText('Delete this file?')).toBeOnTheScreen();
    expect(mockDelete).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('confirm-accept'));
    await act(async () => undefined);
    expect(mockDelete).toHaveBeenCalledWith('1');
    expect(useFiles.getState().items['1']).toBeUndefined();
  });
});

describe('swipe to delete', () => {
  it('asks before deleting from the panel under the row', async () => {
    mockList.mockResolvedValue({
      items: [file('1', 'lease.pdf', 'application/pdf'), file('2', 'id.pdf', 'application/pdf')],
      states: {},
      skipped: 0,
    });
    mockDelete.mockResolvedValue(undefined);
    await renderWithProviders(
      <>
        <FilesListScreen />
        <ConfirmHost />
      </>,
    );
    const user = userEvent.setup();
    await user.press(await screen.findByLabelText('Delete lease.pdf'));
    expect(await screen.findByText(/lease\.pdf goes to the trash/)).toBeOnTheScreen();
    await user.press(screen.getByTestId('confirm-accept'));
    await act(async () => undefined);
    expect(mockDelete).toHaveBeenCalledWith('1');
    expect(screen.queryByTestId('file-row-1')).toBeNull();
    expect(screen.getByTestId('file-row-2')).toBeOnTheScreen();
  });
});

describe('picking several files', () => {
  it('long press starts picking, taps add more, one confirm deletes them all', async () => {
    mockList.mockResolvedValue({
      items: [
        file('1', 'a.pdf', 'application/pdf'),
        file('2', 'b.pdf', 'application/pdf'),
        file('3', 'c.pdf', 'application/pdf'),
      ],
      states: {},
      skipped: 0,
    });
    mockDelete.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderWithProviders(
      <>
        <FilesListScreen />
        <ConfirmHost />
      </>,
    );
    await user.longPress(await screen.findByTestId('file-row-1'));
    expect(screen.getByText('1 selected')).toBeOnTheScreen();
    await user.press(screen.getByTestId('file-row-3'));
    expect(screen.getByText('2 selected')).toBeOnTheScreen();
    expect(mockDownload).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('files-pick-delete'));
    expect(await screen.findByText('Delete 2 files?')).toBeOnTheScreen();
    await user.press(screen.getByTestId('confirm-accept'));
    await act(async () => undefined);
    expect(mockDelete.mock.calls.map((c) => c[0])).toEqual(['1', '3']);
    expect(screen.getByText('Files')).toBeOnTheScreen();
    expect(screen.getByTestId('file-row-2')).toBeOnTheScreen();
  });

  it('leaves picking when the last file is unticked', async () => {
    mockList.mockResolvedValue({
      items: [file('1', 'a.pdf', 'application/pdf')],
      states: {},
      skipped: 0,
    });
    const user = userEvent.setup();
    await renderWithProviders(
      <>
        <FilesListScreen />
        <ConfirmHost />
      </>,
    );
    await user.longPress(await screen.findByTestId('file-row-1'));
    await user.press(screen.getByTestId('file-row-1'));
    expect(screen.queryByText('1 selected')).toBeNull();
    expect(screen.getByText('Files')).toBeOnTheScreen();
  });
});

describe('the delete card', () => {
  it('keeps the file when the person taps Keep', async () => {
    mockList.mockResolvedValue({
      items: [file('1', 'lease.pdf', 'application/pdf')],
      states: {},
      skipped: 0,
    });
    const user = userEvent.setup();
    await renderWithProviders(
      <>
        <FilesListScreen />
        <ConfirmHost />
      </>,
    );
    await user.press(await screen.findByLabelText('Delete lease.pdf'));
    await user.press(await screen.findByTestId('confirm-cancel'));
    await act(async () => undefined);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByTestId('file-row-1')).toBeOnTheScreen();
  });
});
