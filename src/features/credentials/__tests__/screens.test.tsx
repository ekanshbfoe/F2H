// covers: AC-1 (sections, search), AC-2 (form errors, starters, save), AC-3 (generator fills the
// password), AC-4 (mask, reveal, 30 s re-mask, copy notice), AC-9 (empty, error) of spec 0004
import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';

import { renderWithProviders } from '@/lib/test-utils';
import { useSession } from '@/state/session.store';

import {
  credentialPayloadSchema,
  MASK,
  type CredentialPayload,
  type StoredCredential,
} from '../model';
import { CredentialDetailScreen, REVEAL_MS } from '../screens/CredentialDetailScreen';
import { CredentialFormScreen } from '../screens/CredentialFormScreen';
import { CredentialsListScreen } from '../screens/CredentialsListScreen';
import { useCredentials } from '../store';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
const mockList = jest.fn();
const mockCreate = jest.fn();
const mockCopy = jest.fn(async (_v: string) => undefined);

jest.mock('expo-router', () => ({
  useNavigation: () => ({
    setOptions: jest.fn(),
    addListener: jest.fn(() => () => undefined),
    dispatch: jest.fn(),
  }),
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(cb, []);
  },
}));
jest.mock('@/features/lock/hooks', () => ({ useScreenCaptureBlock: () => undefined }));
jest.mock('@/services/clipboard', () => ({
  copySecret: (v: string) => mockCopy(v),
  clearSecretClipboard: jest.fn(async () => undefined),
}));
jest.mock('@/features/vault/items', () => {
  class VaultItemError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    VaultItemError,
    listItems: () => mockList(),
    createItems: (_k: string, ps: unknown[]) => mockCreate(ps),
    updateItem: jest.fn(),
    softDeleteItem: jest.fn(),
  };
});

const make = (id: string, p: Partial<CredentialPayload> & { title: string }): StoredCredential => ({
  id,
  version: 1,
  payload: credentialPayloadSchema.parse({
    v: 1,
    type: 'credential',
    category: 'bank',
    username: 'me',
    password: 'Pa55word!',
    fields: [],
    ...p,
  }),
});

const sbi = make('1', {
  title: 'SBI',
  fields: [
    { label: 'Account number', value: '123456789', secret: true },
    { label: 'IFSC', value: 'SBIN0000001', secret: false },
  ],
});
const gmail = make('2', { title: 'Gmail', category: 'email', url: 'https://mail.google.com' });

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockParams = {};
  mockList.mockReset();
  mockList.mockResolvedValue({ items: [sbi, gmail], skipped: 0 });
  mockCreate.mockReset();
  mockCopy.mockClear();
  useCredentials.getState().clear();
  useSession.setState({
    mk: new Uint8Array(32),
    profile: { id: 'u1', email: 'a@x', display_name: 'A', role: 'member', status: 'active' },
  });
});

describe('CredentialsListScreen', () => {
  it('groups into sections and searches by host, never by password (AC-1)', async () => {
    await renderWithProviders(<CredentialsListScreen />);
    expect(await screen.findByRole('header', { name: 'Bank · 1' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Email · 1' })).toBeOnTheScreen();
    // a chip per category filters the list down to it
    await userEvent.setup().press(screen.getByTestId('credentials-filter-email'));
    expect(screen.queryByRole('header', { name: 'Bank · 1' })).toBeNull();
    await userEvent.setup().press(screen.getByTestId('credentials-filter-all'));
    await fireEvent.changeText(screen.getByTestId('credentials-search'), 'google');
    expect(screen.getByText('Gmail')).toBeOnTheScreen();
    expect(screen.queryByText('SBI')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('credentials-search'), 'Pa55');
    expect(screen.getByTestId('credentials-no-results')).toBeOnTheScreen();
  });

  it('shows the empty state (AC-9)', async () => {
    mockList.mockResolvedValueOnce({ items: [], skipped: 0 });
    await renderWithProviders(<CredentialsListScreen />);
    expect(await screen.findByTestId('credentials-empty')).toBeOnTheScreen();
  });

  it('shows the error state with retry (AC-9)', async () => {
    mockList.mockRejectedValueOnce(new Error('offline'));
    await renderWithProviders(<CredentialsListScreen />);
    expect(await screen.findByText(/Could not load your credentials: offline/)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('SBI')).toBeOnTheScreen();
  });
});

describe('CredentialDetailScreen (AC-4)', () => {
  beforeEach(() => {
    useCredentials.setState({ status: 'ready', items: { '1': sbi } });
    mockParams = { id: '1' };
  });

  it('masks secrets with a fixed mask and shows plain fields', async () => {
    await renderWithProviders(<CredentialDetailScreen />);
    expect(screen.getByTestId('credential-password-value')).toHaveTextContent(MASK);
    expect(screen.getByTestId('credential-field-0-value')).toHaveTextContent(MASK);
    expect(screen.getByTestId('credential-field-1-value')).toHaveTextContent('SBIN0000001');
    expect(screen.queryByText('Pa55word!')).toBeNull();
    expect(screen.queryByText('123456789')).toBeNull();
  });

  it('reveals for 30 seconds then masks again', async () => {
    jest.useFakeTimers();
    try {
      await renderWithProviders(<CredentialDetailScreen />);
      await fireEvent.press(screen.getByTestId('credential-password-reveal'));
      expect(screen.getByTestId('credential-password-value')).toHaveTextContent('Pa55word!');
      await act(async () => {
        jest.advanceTimersByTime(REVEAL_MS);
      });
      expect(screen.getByTestId('credential-password-value')).toHaveTextContent(MASK);
    } finally {
      jest.useRealTimers();
    }
  });

  it('copies through the timed clipboard and says so', async () => {
    await renderWithProviders(<CredentialDetailScreen />);
    await userEvent.setup().press(screen.getByTestId('credential-field-0-copy'));
    expect(mockCopy).toHaveBeenCalledWith('123456789');
    expect(
      await screen.findByText('Account number copied. Clears in 30 seconds.'),
    ).toBeOnTheScreen();
  });
});

describe('CredentialFormScreen', () => {
  it('starts a bank item with the starter fields and refuses an empty one (AC-2)', async () => {
    await renderWithProviders(<CredentialFormScreen />);
    expect(screen.getByTestId('credential-field-label-0').props.value).toBe('Customer ID');
    expect(screen.getByTestId('credential-field-label-1').props.value).toBe('Account number');
    await userEvent.setup().press(screen.getByTestId('credential-save'));
    expect(await screen.findByText('Enter a title')).toBeOnTheScreen();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('switching to Email drops untouched starter fields', async () => {
    await renderWithProviders(<CredentialFormScreen />);
    await userEvent.setup().press(screen.getByTestId('credential-category-email'));
    expect(screen.queryByTestId('credential-field-label-0')).toBeNull();
  });

  it('saves under a category the family names itself', async () => {
    mockCreate.mockImplementation(async (ps: CredentialPayload[]) =>
      ps.map((p, i) => ({ id: `n${i}`, version: 1, payload: p })),
    );
    const user = userEvent.setup();
    await renderWithProviders(<CredentialFormScreen />);
    expect(screen.getByTestId('credential-category-games')).toBeOnTheScreen();
    await user.press(screen.getByTestId('credential-category-new'));
    await fireEvent.changeText(screen.getByTestId('credential-category-name'), '  Game  pass ');
    await user.press(screen.getByTestId('credential-category-add'));
    expect(screen.getByRole('radio', { name: 'Game pass' })).toBeSelected();
    await fireEvent.changeText(screen.getByTestId('credential-title'), 'Xbox');
    await fireEvent.changeText(screen.getByTestId('credential-password-input'), 'secret');
    await user.press(screen.getByTestId('credential-save'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect((mockCreate.mock.calls[0]?.[0] as CredentialPayload[])[0]?.category).toBe('Game pass');
  });

  it('fills the password from the generator and saves (AC-3)', async () => {
    mockCreate.mockImplementation(async (ps: CredentialPayload[]) =>
      ps.map((p, i) => ({ id: `n${i}`, version: 1, payload: p })),
    );
    const user = userEvent.setup();
    await renderWithProviders(<CredentialFormScreen />);
    await user.press(screen.getByTestId('credential-category-email'));
    await fireEvent.changeText(screen.getByTestId('credential-title'), 'Gmail');
    await user.press(screen.getByTestId('credential-generator-toggle'));
    const generated = String(screen.getByTestId('credential-generated').props.children);
    expect(generated).toHaveLength(20);
    await user.press(screen.getByTestId('credential-length-up'));
    expect(String(screen.getByTestId('credential-generated').props.children)).toHaveLength(24);
    await user.press(screen.getByTestId('credential-use-generated'));
    await user.press(screen.getByTestId('credential-save'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    const saved = (mockCreate.mock.calls[0]?.[0] as CredentialPayload[])[0];
    expect(saved?.category).toBe('email');
    expect(saved?.password).toHaveLength(24);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/credentials/[id]',
      params: { id: 'n0' },
    });
  });
});
