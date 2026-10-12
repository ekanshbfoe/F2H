// covers: AC-1 (tabs and counts), AC-2 (form errors and save), AC-3 (call and WhatsApp), AC-4
// (import review, denied), AC-5 (search), AC-9 (empty, no results, error) of spec 0003
import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { renderWithProviders } from '@/lib/test-utils';
import { useSession } from '@/state/session.store';

import { contactPayloadSchema, type ContactPayload, type StoredContact } from '../model';
import { ContactDetailScreen } from '../screens/ContactDetailScreen';
import { ContactFormScreen } from '../screens/ContactFormScreen';
import { ContactsListScreen } from '../screens/ContactsListScreen';
import { ImportContactsScreen } from '../screens/ImportContactsScreen';
import { useContacts } from '../store';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
const mockList = jest.fn();
const mockCreate = jest.fn();
const mockCreateMany = jest.fn();
const mockRead = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(cb, []);
  },
}));
jest.mock('../api', () => {
  class ContactsError extends Error {
    code: string;
    landed: number;
    constructor(code: string, _m?: string, landed = 0) {
      super(code);
      this.code = code;
      this.landed = landed;
    }
  }
  return {
    ContactsError,
    listContacts: () => mockList(),
    createContact: (p: unknown) => mockCreate(p),
    createContacts: (p: unknown[], cb?: (n: number) => void) => mockCreateMany(p, cb),
    updateContact: jest.fn(),
    deleteContact: jest.fn(),
  };
});
jest.mock('expo-contacts', () => ({
  Contact: { getAllDetails: jest.fn() },
  ContactField: { FULL_NAME: 'fullName', PHONES: 'phones' },
  ContactsSortOrder: { GivenName: 'givenName' },
  requestPermissionsAsync: jest.fn(),
}));
jest.mock('../import', () => {
  const actual = jest.requireActual('../import');
  return { ...actual, readDeviceContacts: () => mockRead() };
});

const make = (
  id: string,
  name: string,
  number: string,
  call: boolean,
  whatsapp: boolean,
): StoredContact => ({
  id,
  version: 1,
  payload: contactPayloadSchema.parse({
    v: 1,
    type: 'contact',
    name,
    phones: [{ number, label: 'mobile' }],
    channels: { call, whatsapp },
    source: 'manual',
  }),
});

const book = [
  make('1', 'Papa', '98111 11111', true, true),
  make('2', 'Bhai', '98222 22222', false, true),
  make('3', 'Clinic', '0261 2345678', true, false),
];

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockParams = {};
  mockList.mockReset();
  mockList.mockResolvedValue({ items: book, skipped: 0 });
  mockCreate.mockReset();
  mockCreateMany.mockReset();
  mockRead.mockReset();
  useContacts.getState().clear();
  useSession.setState({
    mk: new Uint8Array(32),
    profile: { id: 'u1', email: 'a@x', display_name: 'A', role: 'member', status: 'active' },
  });
});

describe('ContactsListScreen', () => {
  it('shows both tabs with counts, sorted, and switches tabs (AC-1)', async () => {
    await renderWithProviders(<ContactsListScreen />);
    expect(await screen.findByText('Papa')).toBeOnTheScreen();
    expect(screen.getByText('Call · 2')).toBeOnTheScreen();
    expect(screen.getByText('WhatsApp · 2')).toBeOnTheScreen();
    expect(screen.getByText('Clinic')).toBeOnTheScreen();
    expect(screen.queryByText('Bhai')).toBeNull();
    await userEvent.setup().press(screen.getByText('WhatsApp · 2'));
    expect(await screen.findByText('Bhai')).toBeOnTheScreen();
    expect(screen.queryByText('Clinic')).toBeNull();
  });

  it('filters by name and by digits, and says when nothing matches (AC-5)', async () => {
    await renderWithProviders(<ContactsListScreen />);
    await screen.findByText('Papa');
    await fireEvent.changeText(screen.getByTestId('contacts-search'), '2345');
    expect(screen.getByText('Clinic')).toBeOnTheScreen();
    expect(screen.queryByText('Papa')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('contacts-search'), 'zzz');
    expect(screen.getByTestId('contacts-no-results')).toBeOnTheScreen();
  });

  it('shows the empty state (AC-9)', async () => {
    mockList.mockResolvedValueOnce({ items: [], skipped: 0 });
    await renderWithProviders(<ContactsListScreen />);
    expect(await screen.findByTestId('contacts-empty')).toBeOnTheScreen();
  });

  it('shows the error state and recovers on retry (AC-9)', async () => {
    mockList.mockRejectedValueOnce(new Error('offline'));
    await renderWithProviders(<ContactsListScreen />);
    expect(await screen.findByText(/Could not load your contacts: offline/)).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Papa')).toBeOnTheScreen();
  });

  it('opens a contact', async () => {
    await renderWithProviders(<ContactsListScreen />);
    await userEvent.setup().press(await screen.findByTestId('contact-row-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/contacts/[id]',
      params: { id: '1' },
    });
  });
});

describe('ContactDetailScreen (AC-3)', () => {
  it('calls and opens WhatsApp with the normalized number', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    useContacts.setState({ status: 'ready', items: { '1': book[0]! } });
    mockParams = { id: '1' };
    await renderWithProviders(<ContactDetailScreen />);
    const user = userEvent.setup();
    await user.press(screen.getByTestId('contact-call-0'));
    await user.press(screen.getByTestId('contact-whatsapp-0'));
    expect(open.mock.calls.map((c) => c[0])).toEqual([
      'tel:+919811111111',
      'https://wa.me/919811111111',
    ]);
    open.mockRestore();
  });

  it('disables WhatsApp for a number without a country code', async () => {
    useContacts.setState({ status: 'ready', items: { '3': book[2]! } });
    mockParams = { id: '3' };
    await renderWithProviders(<ContactDetailScreen />);
    expect(screen.getByTestId('contact-whatsapp-0')).toBeDisabled();
    expect(screen.getByText(/WhatsApp needs the country code/)).toBeOnTheScreen();
  });
});

describe('ContactFormScreen (AC-2)', () => {
  it('shows field errors and saves nothing for an empty form', async () => {
    await renderWithProviders(<ContactFormScreen />);
    await userEvent.setup().press(screen.getByTestId('contact-save'));
    expect(await screen.findByText('Enter a name')).toBeOnTheScreen();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('saves a normalized contact and opens it', async () => {
    mockCreate.mockImplementation(async (p: ContactPayload) => ({
      id: 'new',
      version: 1,
      payload: p,
    }));
    await renderWithProviders(<ContactFormScreen />);
    await fireEvent.changeText(screen.getByTestId('contact-name'), 'Mummy');
    await fireEvent.changeText(screen.getByTestId('contact-number-0'), '98333 33333');
    await userEvent.setup().press(screen.getByTestId('contact-save'));
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0]?.[0]).toMatchObject({
      name: 'Mummy',
      phones: [{ number: '+919833333333', label: 'mobile' }],
      channels: { call: true, whatsapp: false },
    });
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/contacts/[id]',
      params: { id: 'new' },
    });
  });
});

describe('ImportContactsScreen (AC-4)', () => {
  it('explains a permanent denial and offers settings', async () => {
    const { ImportError } = jest.requireActual('../import');
    mockRead.mockRejectedValue(new ImportError('permission_denied', false));
    await renderWithProviders(<ImportContactsScreen />);
    await userEvent.setup().press(screen.getByTestId('import-start'));
    expect(await screen.findByTestId('import-settings')).toBeOnTheScreen();
  });

  it('reviews, marks duplicates, selects all and imports with the chosen tags', async () => {
    mockRead.mockResolvedValue({
      entries: [
        { fullName: 'Papa', phones: [{ number: '98111 11111' }] },
        { fullName: 'Neighbour', phones: [{ number: '98444 44444' }] },
        { fullName: 'Shop', phones: [{ number: '98555 55555' }] },
      ],
      capped: false,
    });
    mockCreateMany.mockImplementation(async (ps: ContactPayload[], cb?: (n: number) => void) => {
      cb?.(ps.length);
      return ps.map((p, i) => ({ id: `n${i}`, version: 1, payload: p }));
    });
    const user = userEvent.setup();
    await renderWithProviders(<ImportContactsScreen />);
    await user.press(screen.getByTestId('import-start'));
    expect(await screen.findByText('Already in your vault')).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('import-whatsapp'), 'valueChange', true);
    await user.press(screen.getByTestId('import-select-all'));
    await user.press(screen.getByRole('button', { name: 'Import 2' }));
    expect(await screen.findByText('2 contacts imported')).toBeOnTheScreen();
    const sent = mockCreateMany.mock.calls[0]?.[0] as ContactPayload[];
    expect(sent.map((p) => p.name)).toEqual(['Neighbour', 'Shop']);
    expect(sent.every((p) => p.channels.call && p.channels.whatsapp && p.source === 'device')).toBe(
      true,
    );
  });
});
