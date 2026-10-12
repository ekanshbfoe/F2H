import { AppKeys, appGet, appSet } from '@/services/app-storage';

/**
 * Onboarding (spec 0007). Four warm coloured cards before the first login. The flag is plain
 * AsyncStorage (not a secret) and survives a wipe, so a wiped phone goes straight to login.
 */

export type WarmTone = 'warmOrange' | 'warmYellow' | 'warmRed';

export interface OnboardingCard {
  key: string;
  title: string;
  body: string;
  tone: WarmTone;
  icon: 'people' | 'lock-closed' | 'shield-checkmark' | 'cloud-done';
}

export const CARDS: readonly OnboardingCard[] = [
  {
    key: 'vault',
    title: "Your family's vault",
    body: 'Contacts, bank logins, passwords and files for the four of you, in one private place.',
    tone: 'warmOrange',
    icon: 'people',
  },
  {
    key: 'encrypted',
    title: 'Encrypted before it leaves your phone',
    body: 'Everything is locked on this phone first. The servers and Google only ever see scrambled data.',
    tone: 'warmRed',
    icon: 'lock-closed',
  },
  {
    key: 'approval',
    title: 'The Admin approves every phone',
    body: 'A new phone waits until the Admin taps Approve. A stolen password alone opens nothing.',
    tone: 'warmYellow',
    icon: 'shield-checkmark',
  },
  {
    key: 'drives',
    title: 'Kept on two Google Drives',
    body: 'Every file is stored twice and checked every night, so losing one account loses nothing.',
    tone: 'warmOrange',
    icon: 'cloud-done',
  },
];

export async function hasOnboarded(): Promise<boolean> {
  try {
    return (await appGet(AppKeys.onboarded)) === '1';
  } catch {
    return true; // never block login on a storage hiccup
  }
}

export async function markOnboarded(): Promise<void> {
  await appSet(AppKeys.onboarded, '1');
}
