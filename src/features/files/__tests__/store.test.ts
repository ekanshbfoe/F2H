import { useFiles } from '../store';
import type { StoredFile } from '../model';

const mockDelete = jest.fn();

const mockRemoveFile = jest.fn();
jest.mock('@/services/file-adapter', () => ({
  clearScratch: jest.fn(),
  fileExists: () => true,
  removeFile: (uri: string) => mockRemoveFile(uri),
}));
jest.mock('../api', () => ({
  listFiles: jest.fn(),
  uploadFile: jest.fn(),
  deleteFile: (id: string) => mockDelete(id),
}));

const file = (id: string): StoredFile => ({
  id,
  version: 1,
  payload: {
    v: 1,
    type: 'file',
    name: `${id}.pdf`,
    mime: 'application/pdf',
    size: 10,
    blob_id: 'a'.repeat(32),
    sha256_ct: 'b'.repeat(64),
    size_ct: 20,
    chunk_size: 1048576,
    total_chunks: 1,
    added_at: '2026-10-01T00:00:00Z',
  },
});

beforeEach(() => {
  mockDelete.mockReset();
  const items = { '1': file('1'), '2': file('2'), '3': file('3') };
  useFiles.setState({ status: 'ready', items });
});

describe('removeMany', () => {
  it('deletes every file and drops them from the list', async () => {
    mockDelete.mockResolvedValue(undefined);
    const r = await useFiles.getState().removeMany([file('1'), file('3')]);
    expect(r).toEqual({ deleted: 2, failed: [] });
    expect(Object.keys(useFiles.getState().items)).toEqual(['2']);
  });

  it('keeps the ones that failed and reports them', async () => {
    mockDelete.mockImplementation((id: string) =>
      id === '2' ? Promise.reject(new Error('offline')) : Promise.resolve(),
    );
    const r = await useFiles.getState().removeMany([file('1'), file('2'), file('3')]);
    expect(r).toEqual({ deleted: 2, failed: ['2'] });
    expect(Object.keys(useFiles.getState().items)).toEqual(['2']);
  });
});

describe('remove', () => {
  it('deletes the decrypted copy with the file', async () => {
    mockDelete.mockResolvedValue(undefined);
    useFiles.setState({ opened: { '1': 'file:///cache/f2h-open/1.pdf' } });
    await useFiles.getState().remove(file('1'));
    expect(mockRemoveFile).toHaveBeenCalledWith('file:///cache/f2h-open/1.pdf');
    expect(useFiles.getState().opened['1']).toBeUndefined();
  });
});
