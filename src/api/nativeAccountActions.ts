import { z } from 'zod';
import { canUseNativeAccountLinks } from '../core/capabilities';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
import type { NativeAccountAction } from '../core/nativeAccountLink';
import { readBootstrap } from './bootstrap';
import { isSupportedPassword } from '../domain/passwordPolicy';
import {
  nativeAccountProofSchema,
  NATIVE_ACCOUNT_PASSWORD_MAX_LENGTH,
} from '../domain/nativeAccountPolicy';

export const resetNativePasswordSchema = z
  .strictObject({
    newPassword: z.string().max(NATIVE_ACCOUNT_PASSWORD_MAX_LENGTH).refine(isSupportedPassword),
    confirmPassword: z.string().max(NATIVE_ACCOUNT_PASSWORD_MAX_LENGTH),
  })
  .refine((value) => value.newPassword === value.confirmPassword, { path: ['confirmPassword'] });
export type ResetNativePassword = z.infer<typeof resetNativePasswordSchema>;
type NativeAccountRoute =
  'register' | 'request-verification' | 'request-password-reset' | 'verify' | 'reset-password';
export async function requireNativeAccountActions(
  client: CustomerTransport,
  context: TenantContext,
) {
  const bootstrap = await readBootstrap(client, context);
  if (!canUseNativeAccountLinks(bootstrap)) throw new ApiFailure(403, 'refused');
}
export async function sendNativeAccountAction(
  client: CustomerTransport,
  context: TenantContext,
  route: NativeAccountRoute,
  body: unknown,
  locale: string,
  assertCurrent: () => void,
) {
  assertCurrent();
  await requireNativeAccountActions(client, context);
  assertCurrent();
  await client.request(context, '/api/customer-mobile/auth/' + route, z.string(), {
    method: 'POST',
    credentials: 'none',
    body,
    locale,
    assertCurrent,
  });
}
export async function completeNativeAccountAction(
  client: CustomerTransport,
  context: TenantContext,
  action: NativeAccountAction,
  proof: string,
  locale: string,
  assertCurrent: () => void,
  password?: ResetNativePassword,
) {
  const body =
    action === 'verify'
      ? { schemaVersion: 1, proof: nativeAccountProofSchema.parse(proof) }
      : {
          schemaVersion: 1,
          proof: nativeAccountProofSchema.parse(proof),
          ...resetNativePasswordSchema.parse(password),
        };
  await sendNativeAccountAction(
    client,
    context,
    action === 'verify' ? 'verify' : 'reset-password',
    body,
    locale,
    assertCurrent,
  );
}
