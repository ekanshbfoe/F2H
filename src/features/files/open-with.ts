import { File } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** Android's FLAG_GRANT_READ_URI_PERMISSION: the viewer app may read this one file. */
const GRANT_READ = 1;

/**
 * Hands a decrypted copy to a viewer app. Android asks "Open with" (the phone's PDF reader, Word,
 * a gallery); iOS, and an Android phone with no app for the type, get the share menu instead.
 * Returns false when nothing on the phone can take it.
 */
export async function openWith(uri: string, mime: string): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: new File(uri).contentUri,
        type: mime,
        flags: GRANT_READ,
      });
      return true;
    } catch {
      // no app for this type: fall through to the share menu
    }
  }
  return share(uri, mime);
}

/** The system share menu (send it to WhatsApp, Gmail, Drive). */
export async function share(uri: string, mime: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: mime });
  return true;
}
