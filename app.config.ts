/// <reference types="node" />
import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * The values that tie a build to one family's accounts come from `.env` (see `.env.example`),
 * so the repo carries none of them:
 *
 * - `F2H_APP_ID`: the Android package and iOS bundle id, for example `com.yourname.f2h`.
 * - `EXPO_PUBLIC_EAS_PROJECT_ID`: the EAS project that builds the app and sends push.
 *
 * EAS cloud builds never see `.env`; `npm run eas:env` copies both into the EAS environments.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No local .env: an EAS cloud build, or a fresh clone before setup.
}

const APP_ID = process.env.F2H_APP_ID || 'com.example.f2h';
const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'F2H',
  slug: config.slug ?? 'f2h',
  ios: { ...config.ios, bundleIdentifier: APP_ID },
  android: { ...config.android, package: APP_ID },
  extra: {
    ...config.extra,
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
