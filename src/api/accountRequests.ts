import { z } from 'zod';
import type { CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
import { loginSchema } from './auth';
import { isSupportedPassword } from '../domain/passwordPolicy';
import { NATIVE_ACCOUNT_PASSWORD_MAX_LENGTH } from '../domain/nativeAccountPolicy';
import { sendNativeAccountAction } from './nativeAccountActions';
export const recoverySchema = z.object({ email: loginSchema.shape.email }).strict();
export const registrationSchema = recoverySchema
  .extend({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    password: z.string().max(NATIVE_ACCOUNT_PASSWORD_MAX_LENGTH).refine(isSupportedPassword),
    confirmPassword: z.string().max(NATIVE_ACCOUNT_PASSWORD_MAX_LENGTH),
  })
  .refine((input) => input.password === input.confirmPassword, { path: ['confirmPassword'] });
export type RegistrationInput = z.infer<typeof registrationSchema>;
export type RecoveryInput = z.infer<typeof recoverySchema>;
export async function requestRegistration(
  client: CustomerTransport,
  context: TenantContext,
  input: RegistrationInput,
  locale: string,
  assertCurrent: () => void,
): Promise<void> {
  const body = { schemaVersion: 1, ...registrationSchema.parse(input) };
  await sendNativeAccountAction(client, context, 'register', body, locale, assertCurrent);
}
export async function requestRecovery(
  client: CustomerTransport,
  context: TenantContext,
  input: RecoveryInput,
  locale: string,
  assertCurrent: () => void,
): Promise<void> {
  const body = { schemaVersion: 1, ...recoverySchema.parse(input) };
  await sendNativeAccountAction(
    client,
    context,
    'request-password-reset',
    body,
    locale,
    assertCurrent,
  );
}
export async function requestVerification(
  client: CustomerTransport,
  context: TenantContext,
  input: RecoveryInput,
  locale: string,
  assertCurrent: () => void,
): Promise<void> {
  const body = { schemaVersion: 1, ...recoverySchema.parse(input) };
  await sendNativeAccountAction(
    client,
    context,
    'request-verification',
    body,
    locale,
    assertCurrent,
  );
}
