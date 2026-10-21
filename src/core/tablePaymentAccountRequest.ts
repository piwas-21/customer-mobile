import { ApiFailure } from './apiFailure';
import { canonicalUuidSchema } from './identifiers';
import { principalSchema, type CredentialVault } from './credentials';
import type { RequestOptions } from './httpTypes';
import { tableAccountHeaders } from './tableAccountRequest';
import { captureTablePaymentScope, tablePaymentAccountPath } from './tablePaymentReadScope';
import type { TenantContext } from './tenantContext';

export function captureTablePaymentAccountRequest(
  context: TenantContext,
  path: string,
  options: RequestOptions,
): RequestOptions {
  if (options.credentials !== 'table-payment-account') {
    if (options.expectedTablePaymentAccount !== undefined) throw new ApiFailure(401, 'refused');
    return options;
  }
  const principal = principalSchema.parse(options.principal);
  const scope = captureTablePaymentScope(context, principal, options.expectedTablePaymentAccount);
  if (
    options.method !== 'GET' ||
    options.body !== undefined ||
    !options.assertCurrent ||
    path !== tablePaymentAccountPath(context, scope)
  )
    throw new ApiFailure(401, 'refused');
  return { ...options, principal, expectedTablePaymentAccount: scope };
}
export async function tablePaymentAccountHeaders(
  context: TenantContext,
  vault: CredentialVault,
  options: RequestOptions,
): Promise<Record<string, string>> {
  const principal = principalSchema.parse(options.principal);
  const scope = captureTablePaymentScope(context, principal, options.expectedTablePaymentAccount);
  if (!options.assertCurrent) throw new ApiFailure(401, 'refused');
  const headers: Record<string, string> = {};
  if (principal.kind === 'customer') {
    const session = await vault.session(context, principal.id);
    options.assertCurrent();
    if (!session) throw new ApiFailure(401, 'refused');
    headers.Authorization = `Bearer ${session.accessToken}`;
  }
  const sessionId = canonicalUuidSchema.parse(
    await vault.capability(context, 'guest-session', principal),
  );
  options.assertCurrent();
  if (sessionId !== scope.sessionId) throw new ApiFailure(401, 'refused');
  headers['X-Session-Id'] = sessionId;
  Object.assign(
    headers,
    await tableAccountHeaders(context, vault, { ...options, expectedTableVisit: scope.visit }),
  );
  options.assertCurrent();
  return headers;
}
