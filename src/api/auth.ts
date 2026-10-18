import { z } from 'zod';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
import { credentialSecretSchema, type CustomerSession } from '../core/credentials';
const authSchema = z.object({
  userId: z.uuid(),
  role: z.literal('Customer'),
  accessToken: credentialSecretSchema,
  refreshToken: credentialSecretSchema,
});
export const loginSchema = z
  .object({
    email: z.string().trim().max(254).pipe(z.email()),
    password: z.string().min(1).max(1024),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;
export async function signIn(
  client: CustomerTransport,
  context: TenantContext,
  input: LoginInput,
  locale: string,
): Promise<CustomerSession> {
  const response = await client.request(context, '/api/Auth/login', authSchema, {
    method: 'POST',
    body: loginSchema.parse(input),
    locale,
  });
  return {
    userId: response.userId,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
  };
}
export async function refreshSession(
  client: CustomerTransport,
  context: TenantContext,
  session: CustomerSession,
): Promise<CustomerSession> {
  const captured = { ...session };
  const response = await client.request(context, '/api/Auth/refresh-token', authSchema, {
    method: 'POST',
    body: { accessToken: captured.accessToken, refreshToken: captured.refreshToken },
  });
  if (response.userId !== captured.userId) throw new ApiFailure(200, 'contract');
  return {
    userId: response.userId,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
  };
}
