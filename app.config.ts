import type { ExpoConfig } from 'expo/config';
function configuredLinkHost(value: string | undefined) {
  if (value === undefined) return undefined;
  const url = new URL(value);
  if (url.protocol !== 'https:' || value !== url.origin || url.port)
    throw new Error('Native app links require a canonical HTTPS origin on the standard port.');
  return url.hostname;
}
const linkHost = configuredLinkHost(process.env.EXPO_PUBLIC_MOBILE_LINK_ORIGIN);
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
    associatedDomains: linkHost ? [`applinks:${linkHost}`] : [],
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: identifier,
    allowBackup: false,
    intentFilters: linkHost
      ? [
          {
            action: 'VIEW',
            autoVerify: true,
            data: [
              { scheme: 'https', host: linkHost, pathPattern: '/r/.*/payment-return/.*' },
              { scheme: 'https', host: linkHost, pathPattern: '/r/.*/verify' },
              { scheme: 'https', host: linkHost, pathPattern: '/r/.*/recover' },
            ],
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ]
      : [],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
  },
  plugins: [
    'expo-router',
    ['expo-secure-store', { configureAndroidBackup: true, faceIDPermission: false }],
    [
      'expo-camera',
      {
        cameraPermission: 'Allow Sofra to scan restaurant QR codes.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    'expo-web-browser',
    'expo-localization',
    'expo-image',
    'expo-system-ui',
  ],
  experiments: { typedRoutes: false },
  updates: { enabled: false },
};
export default config;
