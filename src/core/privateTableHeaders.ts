import { ApiFailure } from './apiFailure';
import type { CredentialVault, Principal } from './credentials';
import type { RequestOptions } from './httpTypes';
import { refreshCredentialsSchema } from './refreshCredentials';
import { tableAccountHeaders } from './tableAccountRequest';
import type { TableVisitRecord } from './tableVisitRecord';
import type { TenantContext } from './tenantContext';
export async function privateTableCustomerHeaders(
  context: TenantContext,
  vault: CredentialVault,
  options: RequestOptions,
  renewal: boolean,
) {
  if (options.principal?.kind !== 'customer') return {};
  const session = await vault.session(context, options.principal.id);
  options.assertCurrent!();
  if (!session) throw new ApiFailure(401, 'refused');
  if (!renewal) return { Authorization: `Bearer ${session.accessToken}` };
  const body = refreshCredentialsSchema.parse(options.body);
  if (body.accessToken !== session.accessToken || body.refreshToken !== session.refreshToken)
    throw new ApiFailure(401, 'refused');
  return {};
}
export async function tablePreparationHeaders(
  context: TenantContext,
  vault: CredentialVault,
  options: RequestOptions,
  preparation: { principal: Principal; sessionId: string; visit: TableVisitRecord },
  validate: () => unknown,
) {
  const session = await vault.capability(context, 'guest-session', preparation.principal);
  options.assertCurrent!();
  if (session !== preparation.sessionId) throw new ApiFailure(401, 'refused');
  const participant = await tableAccountHeaders(context, vault, {
    ...options,
    expectedTableVisit: preparation.visit,
  });
  validate();
  return participant;
}
