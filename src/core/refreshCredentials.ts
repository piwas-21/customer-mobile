import { z } from 'zod';
import { credentialSecretSchema } from './credentials';
export const refreshCredentialsSchema = z.strictObject({
  accessToken: credentialSecretSchema,
  refreshToken: credentialSecretSchema,
});
