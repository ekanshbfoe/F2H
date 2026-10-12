import { Redirect } from 'expo-router';

import { DRIVE_HREF } from '@/features/files/routes';

/** The Google link return URL. The auth session normally catches it; if Android opens it, go back to the Drive screen. */
export default function DriveLinked() {
  return <Redirect href={DRIVE_HREF} />;
}
