import { z } from 'zod';
import { credentialSecretSchema } from '../core/credentials';
export const customerAuthResponseSchema = z.object({
  userId: z.uuid(),
  role: z.literal('Customer'),
  accessToken: credentialSecretSchema,
  refreshToken: credentialSecretSchema,
});
