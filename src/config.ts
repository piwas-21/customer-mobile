import { z } from 'zod';
import { environmentSchema, originSchema } from './core/directory';
const configSchema = z.object({
  environment: environmentSchema,
  directoryOrigin: originSchema,
  linkOrigin: originSchema,
});
const parsed = configSchema.safeParse({
  environment: process.env.EXPO_PUBLIC_ENVIRONMENT,
  directoryOrigin: process.env.EXPO_PUBLIC_MOBILE_DIRECTORY_ORIGIN,
  linkOrigin: process.env.EXPO_PUBLIC_MOBILE_LINK_ORIGIN,
});
export const runtimeConfig = parsed.success ? parsed.data : undefined;
