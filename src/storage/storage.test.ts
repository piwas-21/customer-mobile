import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { readPreferences, savePreferences } from './publicPreferences';
import { deviceSecrets } from './secrets';
import { tenantA } from '../test/fixtures';
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
it('separates public preferences by environment and rejects extra private fields', async () => {
  jest
    .mocked(AsyncStorage.getItem)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce('not JSON')
    .mockResolvedValueOnce(JSON.stringify({ savedIds: [], token: 'private' }))
    .mockResolvedValueOnce(JSON.stringify({ savedIds: [tenantA], lastTenantId: tenantA }));
  expect(await readPreferences('staging')).toEqual({ savedIds: [] });
  expect(await readPreferences('staging')).toEqual({ savedIds: [] });
  expect(await readPreferences('staging')).toEqual({ savedIds: [] });
  expect(await readPreferences('production')).toEqual({
    savedIds: [tenantA],
    lastTenantId: tenantA,
  });
  await savePreferences('production', { savedIds: [tenantA] });
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    'public.v1.production.restaurants',
    JSON.stringify({ savedIds: [tenantA] }),
  );
  await expect(savePreferences('staging', { savedIds: ['invalid'] })).rejects.toThrow();
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
});
it('keeps all credential operations in device-only unlocked SecureStore', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('credential');
  expect(await deviceSecrets.get('scope')).toBe('credential');
  await deviceSecrets.set('scope', 'credential');
  await deviceSecrets.remove('scope');
  const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  expect(SecureStore.getItemAsync).toHaveBeenCalledWith('scope', options);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('scope', 'credential', options);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('scope', options);
});
