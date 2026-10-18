import type { ExpoConfig } from 'expo/config';
const production = process.env.EXPO_PUBLIC_ENVIRONMENT === 'production';
// Provisional company identifiers; signing/publisher ownership must be confirmed before production.
const identifier = production ? 'com.sofrapiwas.customer' : 'com.sofrapiwas.customer.staging';
const config: ExpoConfig = {
  name: production ? 'Sofra' : 'Sofra Preview',
  slug: 'sofra-customer',
  version: '0.1.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: identifier,
    supportsTablet: true,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: identifier,
    allowBackup: false,
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
  },
  plugins: [
    'expo-router',
    ['expo-secure-store', { configureAndroidBackup: true }],
    [
      'expo-camera',
      { cameraPermission: 'Allow Sofra to scan restaurant QR codes.', recordAudioAndroid: false },
    ],
    'expo-web-browser',
    'expo-localization',
    'expo-image',
  ],
  experiments: { typedRoutes: false },
  updates: { enabled: false },
};
export default config;
