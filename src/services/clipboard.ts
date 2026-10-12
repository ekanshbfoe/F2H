import * as Clipboard from 'expo-clipboard';

/**
 * Time boxed clipboard for secrets (spec 0004, AC-4). The copied value is remembered only in
 * memory; the clear checks that the clipboard still holds it, so a value the member copied
 * afterwards is never wiped. Expo Go cannot flag the content as sensitive (see the spec).
 */

export const CLIPBOARD_CLEAR_MS = 30_000;

let pending: { value: string; timer: ReturnType<typeof setTimeout> } | null = null;

export async function clearSecretClipboard(): Promise<void> {
  const current = pending;
  if (!current) return;
  clearTimeout(current.timer);
  pending = null;
  try {
    if ((await Clipboard.getStringAsync()) === current.value) await Clipboard.setStringAsync('');
  } catch {
    // the clipboard is the OS's; nothing more to do
  }
}

export async function copySecret(value: string, ms = CLIPBOARD_CLEAR_MS): Promise<void> {
  if (pending) clearTimeout(pending.timer);
  await Clipboard.setStringAsync(value);
  pending = {
    value,
    timer: setTimeout(() => {
      void clearSecretClipboard();
    }, ms),
  };
}

/** True while a copied secret is waiting to be cleared. */
export function hasPendingSecret(): boolean {
  return pending !== null;
}
