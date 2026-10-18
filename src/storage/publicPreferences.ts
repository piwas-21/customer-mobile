import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';
import type { Environment } from '../core/directory';
const preferencesSchema = z
  .object({
    lastTenantId: z.uuid().optional(),
    savedIds: z.array(z.uuid()).max(100),
  })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;
export async function readPreferences(environment: Environment): Promise<Preferences> {
  const raw = await AsyncStorage.getItem(`public.v1.${environment}.restaurants`);
  if (!raw) return { savedIds: [] };
  try {
    return preferencesSchema.parse(JSON.parse(raw));
  } catch {
    return { savedIds: [] };
  }
}
export async function savePreferences(
  environment: Environment,
  preferences: Preferences,
): Promise<void> {
  await AsyncStorage.setItem(
    `public.v1.${environment}.restaurants`,
    JSON.stringify(preferencesSchema.parse(preferences)),
  );
}
