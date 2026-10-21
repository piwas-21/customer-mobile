import { scopedTableVisit } from './tableVisitRecord';
import { ApiFailure } from './apiFailure';
import { principalSchema, type CredentialVault } from './credentials';
import type { RequestOptions } from './httpTypes';
import type { TenantContext } from './tenantContext';
export function captureTableAccountRequest(
  context: TenantContext,
  path: string,
  options: RequestOptions,
): RequestOptions {
  if (options.credentials !== 'table-account') {
    if (options.expectedTableVisit !== undefined) throw new ApiFailure(401, 'refused');
    return options;
  }
  const principal = principalSchema.parse(options.principal);
  const record = scopedTableVisit(context, principal, options.expectedTableVisit);
  if (
    options.method !== 'GET' ||
    options.body !== undefined ||
    !options.assertCurrent ||
    path !== '/api/table-guest-visits/' + record.identity.serviceSessionId + '/account'
  )
    throw new ApiFailure(401, 'refused');
  return { ...options, principal, expectedTableVisit: record };
}
export async function tableAccountHeaders(
  context: TenantContext,
  vault: CredentialVault,
  options: RequestOptions,
): Promise<Record<string, string>> {
  const principal = principalSchema.parse(options.principal);
  const expected = scopedTableVisit(context, principal, options.expectedTableVisit);
  if (!options.assertCurrent || Date.parse(expected.identity.expiresAt) <= Date.now())
    throw new ApiFailure(401, 'refused');
  const raw = await vault.capability(context, 'table-participant', principal);
  options.assertCurrent();
  if (raw === null) throw new ApiFailure(401, 'refused');
  const saved = scopedTableVisit(context, principal, JSON.parse(raw));
  if (
    JSON.stringify(saved) !== JSON.stringify(expected) ||
    Date.parse(saved.identity.expiresAt) <= Date.now()
  )
    throw new ApiFailure(401, 'refused');
  return { 'X-Table-Participant': saved.identity.participantToken };
}
