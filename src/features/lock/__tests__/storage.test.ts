// covers: AC-7 of spec 0001-admin-device-self-approval (the last admin phone warning reads the cache)
import AsyncStorage from '@react-native-async-storage/async-storage';

import { isLastAdminPhone } from '../storage';

const admin = JSON.stringify({ id: 'u1', role: 'admin' });
const member = JSON.stringify({ id: 'u2', role: 'member' });

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('isLastAdminPhone', () => {
  it('is false without a cached profile or for a member, whatever the count says', async () => {
    await expect(isLastAdminPhone()).resolves.toBe(false);
    await AsyncStorage.setItem('f2h.profile', member);
    await AsyncStorage.setItem('f2h.admin_approved_count', '1');
    await expect(isLastAdminPhone()).resolves.toBe(false);
  });

  it('warns the admin when the count is missing, 1 or lower, or unreadable', async () => {
    await AsyncStorage.setItem('f2h.profile', admin);
    await expect(isLastAdminPhone()).resolves.toBe(true);
    await AsyncStorage.setItem('f2h.admin_approved_count', '1');
    await expect(isLastAdminPhone()).resolves.toBe(true);
    await AsyncStorage.setItem('f2h.admin_approved_count', '0');
    await expect(isLastAdminPhone()).resolves.toBe(true);
    await AsyncStorage.setItem('f2h.admin_approved_count', 'garbage');
    await expect(isLastAdminPhone()).resolves.toBe(true);
  });

  it('stays quiet when another approved admin phone exists', async () => {
    await AsyncStorage.setItem('f2h.profile', admin);
    await AsyncStorage.setItem('f2h.admin_approved_count', '2');
    await expect(isLastAdminPhone()).resolves.toBe(false);
  });

  it('is false on a corrupt profile cache', async () => {
    await AsyncStorage.setItem('f2h.profile', '{not json');
    await expect(isLastAdminPhone()).resolves.toBe(false);
  });
});
