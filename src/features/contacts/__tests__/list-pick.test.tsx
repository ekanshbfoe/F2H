// Contacts list: swipe to delete, long press to pick several, delete them or save them to the phone.
import { act, screen, userEvent } from '@testing-library/react-native';

import { ConfirmHost } from '@/components/ui';
import { renderWithProviders } from '@/lib/test-utils';
import { useSession } from '@/state/session.store';

import type { StoredContact } from '../model';
import { ContactsListScreen } from '../screens/ContactsListScreen';
import { useContacts } from '../store';

const mockList = jest.fn();
const mockDelete = jest.fn();
const mockSave = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').useEffect(cb, []);
  },
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('../api', () => ({
  listContacts: () => mockList(),
  createContact: jest.fn(),
  createContacts: jest.fn(),
  updateContact: jest.fn(),
  deleteContact: (id: string) => mockDelete(id),
}));
jest.mock('../export', () => ({
  saveToPhone: (list: StoredContact[]) => mockSave(list),
}));
jest.mock('expo-contacts', () => ({
  Contact: { getAllDetails: jest.fn(), create: jest.fn() },
  ContactField: { FULL_NAME: 'fullName', PHONES: 'phones' },
  ContactsSortOrder: { GivenName: 'givenName' },
  requestPermissionsAsync: jest.fn(),
}));

const contact = (id: string, name: string): StoredContact => ({
  id,
  version: 1,
  payload: {
    v: 1,
    type: 'contact',
    name,
    phones: [{ number: `+9198765432${id.padStart(2, '0')}`, label: 'mobile' }],
    note: undefined,
    source: 'manual',
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  useContacts.getState().clear();
  useSession.setState({ mk: new Uint8Array(32) });
  mockList.mockResolvedValue({
    items: [contact('1', 'Asha'), contact('2', 'Bina'), contact('3', 'Chetan')],
    skipped: 0,
    offline: false,
  });
  mockDelete.mockResolvedValue(undefined);
});

async function show() {
  await renderWithProviders(
    <>
      <ContactsListScreen />
      <ConfirmHost />
    </>,
  );
  return userEvent.setup();
}

describe('contacts list actions', () => {
  it('asks before a swipe delete', async () => {
    const user = await show();
    await user.press(await screen.findByLabelText('Delete Asha'));
    expect(await screen.findByText('Delete this contact?')).toBeOnTheScreen();
    await user.press(screen.getByTestId('confirm-accept'));
    await act(async () => undefined);
    expect(mockDelete).toHaveBeenCalledWith('1');
    expect(screen.queryByTestId('contact-row-1')).toBeNull();
  });

  it('picks all and deletes everything after one confirm', async () => {
    const user = await show();
    await user.longPress(await screen.findByTestId('contact-row-2'));
    expect(screen.getByText('1 selected')).toBeOnTheScreen();
    await user.press(screen.getByTestId('contacts-pick-all'));
    expect(screen.getByText('3 selected')).toBeOnTheScreen();
    await user.press(screen.getByTestId('contacts-pick-delete'));
    expect(await screen.findByText('Delete all 3 contacts?')).toBeOnTheScreen();
    await user.press(screen.getByTestId('confirm-accept'));
    await act(async () => undefined);
    expect(mockDelete).toHaveBeenCalledTimes(3);
    expect(await screen.findByTestId('contacts-empty')).toBeOnTheScreen();
  });

  it('saves the picked ones to the phone and reports what happened', async () => {
    mockSave.mockResolvedValue({ added: 1, skipped: 1, failed: 0 });
    const user = await show();
    await user.longPress(await screen.findByTestId('contact-row-1'));
    await user.press(screen.getByTestId('contact-row-3'));
    await user.press(screen.getByTestId('contacts-pick-save'));
    await act(async () => undefined);
    expect(mockSave.mock.calls[0]?.[0].map((c: StoredContact) => c.id)).toEqual(['1', '3']);
    expect(
      await screen.findByText("1 saved to this phone's contacts, 1 already there."),
    ).toBeOnTheScreen();
    expect(screen.queryByText('2 selected')).toBeNull();
  });
});
