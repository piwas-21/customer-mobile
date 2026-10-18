import { z } from 'zod';
import type { CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
import { loginSchema } from './auth';
import { isSupportedPassword } from '../domain/passwordPolicy';
export const recoverySchema = z.object({ email: loginSchema.shape.email }).strict();
export const registrationSchema = recoverySchema
  .extend({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    password: z.string().refine(isSupportedPassword),
    confirmPassword: z.string(),
  })
  .refine((input) => input.password === input.confirmPassword, { path: ['confirmPassword'] });
export type RegistrationInput = z.infer<typeof registrationSchema>;
export type RecoveryInput = z.infer<typeof recoverySchema>;
export async function requestRegistration(
  client: CustomerTransport,
  context: TenantContext,
  input: RegistrationInput,
  locale: string,
): Promise<void> {
  // Registration currently returns tokens. Discard them: verification and explicit
  // sign-in are separate actions; no credential is persisted or exposed to UI here.
  await client.request(
    context,
    '/api/User/register/customer',
    z.object({ userId: z.uuid(), role: z.literal('Customer') }),
    {
      method: 'POST',
      body: registrationSchema.parse(input),
      locale,
    },
  );
}
export async function requestRecovery(
  client: CustomerTransport,
  context: TenantContext,
  input: RecoveryInput,
  locale: string,
): Promise<void> {
  await client.request(context, '/api/Auth/forgot-password', z.string(), {
    method: 'POST',
    body: recoverySchema.parse(input),
    locale,
  });
}
