// covers: AC-3 (unseal, verify, decrypt each kind; a tampered verifier decrypts nothing) and AC-5
// (activity labels, who lines, the screen) of spec 0005
import { screen } from '@testing-library/react-native';

import { box, envelope, recovery, toBase64, verifier } from '@/crypto';
import { contactPayloadSchema } from '@/features/contacts/model';
import { credentialPayloadSchema } from '@/features/credentials/model';
import { renderWithProviders } from '@/lib/test-utils';
import { sealItem } from '@/features/vault/items';
import { useSession } from '@/state/session.store';

import { labelFor, whoLine, ACTION_LABELS, type AuditRow } from '../../audit/model';
import { ActivityScreen } from '../../audit/screens/ActivityScreen';
import { decryptMemberVault, OversightError } from '../oversight';

const mockActivity = jest.fn();
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/services/functions', () => ({ callFunction: jest.fn() }));
jest.mock('@/features/keyring/admin-recovery', () => ({ loadRecoverySecretKey: jest.fn() }));
jest.mock('../../audit/api', () => ({ ACTIVITY_LIMIT: 100, listActivity: () => mockActivity() }));
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

const MEMBER = 'f1000000-0000-4000-8000-0000000000f1';

function fixture() {
  const kit = recovery.deriveRecoveryKeypair(new Uint8Array(32).fill(4));
  const mk = envelope.generateMasterKey();
  const contact = contactPayloadSchema.parse({
    v: 1,
    type: 'contact',
    name: 'Papa',
    phones: [{ number: '98111 11111', label: 'mobile' }],
    channels: { call: true, whatsapp: true },
    source: 'manual',
  });
  const cred = credentialPayloadSchema.parse({
    v: 1,
    type: 'credential',
    category: 'bank',
    title: 'SBI',
    password: 'p',
    fields: [],
  });
  const rows = [
    { id: 'c1', kind: 'contact', version: 1, ...sealItem(mk, 'c1', contact) },
    { id: 'k1', kind: 'credential', version: 2, ...sealItem(mk, 'k1', cred) },
    { id: 'n1', kind: 'note', version: 1, ...sealItem(mk, 'n1', { type: 'note' }) },
  ];
  return {
    kit,
    res: {
      mk_wrapped_admin: toBase64(box.seal(kit.publicKey, mk)),
      mk_verifier: toBase64(verifier.make(mk, MEMBER)),
      items: rows,
    },
  };
}

describe('decryptMemberVault (AC-3)', () => {
  it('unseals with the recovery key and decrypts contacts and credentials, skipping notes', () => {
    const { kit, res } = fixture();
    const v = decryptMemberVault(kit.secretKey, MEMBER, res);
    expect(v.contacts.map((c) => c.payload.name)).toEqual(['Papa']);
    expect(v.credentials.map((c) => [c.payload.title, c.version])).toEqual([['SBI', 2]]);
    expect(v.files).toEqual([]);
  });

  it('refuses a wrap whose verifier does not match and decrypts nothing', () => {
    const { kit, res } = fixture();
    const other = envelope.generateMasterKey();
    const tampered = { ...res, mk_verifier: toBase64(verifier.make(other, MEMBER)) };
    expect(() => decryptMemberVault(kit.secretKey, MEMBER, tampered)).toThrow(OversightError);
    const wrongMember = { ...res };
    expect(() =>
      decryptMemberVault(kit.secretKey, 'f2000000-0000-4000-8000-0000000000f2', wrongMember),
    ).toThrow(OversightError);
  });

  it('refuses a wrap sealed to another recovery key', () => {
    const { res } = fixture();
    const otherKit = recovery.deriveRecoveryKeypair(new Uint8Array(32).fill(9));
    expect(() => decryptMemberVault(otherKit.secretKey, MEMBER, res)).toThrow(OversightError);
  });
});

describe('activity labels (AC-5)', () => {
  const row = (action: string, actor: string | null, target: string | null): AuditRow => ({
    id: 1,
    actor_id: actor,
    target_user_id: target,
    action,
    meta: { model: 'LAVA' },
    created_at: '2026-10-12T10:00:00Z',
  });

  it('labels every backend action and falls back to the raw name', () => {
    expect(labelFor('oversight.open')).toBe('The Admin opened a vault, read only');
    expect(labelFor('something.new')).toBe('something.new');
    expect(Object.keys(ACTION_LABELS)).toEqual(
      expect.arrayContaining(['device.self_approve', 'device.revoke', 'file.upload', 'drive.link']),
    );
  });

  it('says who from the viewer side', () => {
    const member = { id: 'm1', isAdmin: false };
    expect(whoLine(row('oversight.open', 'adm', 'm1'), member, {})).toBe(
      'The Admin viewed your vault',
    );
    expect(whoLine(row('file.upload', 'm1', 'm1'), member, {})).toBe('You');
    const admin = { id: 'adm', isAdmin: true };
    expect(whoLine(row('oversight.open', 'adm', 'm1'), admin, { m1: 'Bhai' })).toBe('Viewed Bhai');
    expect(whoLine(row('device.revoke', 'adm', 'm1'), admin, { m1: 'Bhai' })).toBe(
      'You · about Bhai',
    );
  });
});

describe('ActivityScreen (AC-5)', () => {
  it('shows the oversight row to the member with the About you badge', async () => {
    useSession.setState({
      profile: { id: 'm1', email: 'm@x', display_name: 'Bhai', role: 'member', status: 'active' },
    });
    mockActivity.mockResolvedValue({
      rows: [
        {
          id: 2,
          actor_id: 'adm',
          target_user_id: 'm1',
          action: 'oversight.open',
          meta: {},
          created_at: '2026-10-12T10:00:00Z',
        },
        {
          id: 1,
          actor_id: 'm1',
          target_user_id: 'm1',
          action: 'file.upload',
          meta: {},
          created_at: '2026-10-11T10:00:00Z',
        },
      ],
      names: { m1: 'Bhai' },
    });
    await renderWithProviders(<ActivityScreen />);
    expect(await screen.findByText('The Admin opened a vault, read only')).toBeOnTheScreen();
    expect(screen.getByText('About you')).toBeOnTheScreen();
    expect(screen.getByText('A file was saved to the Drives')).toBeOnTheScreen();
  });

  it('shows the empty state', async () => {
    mockActivity.mockResolvedValue({ rows: [], names: {} });
    await renderWithProviders(<ActivityScreen />);
    expect(await screen.findByTestId('activity-empty')).toBeOnTheScreen();
  });
});
