import { canonicalUuidSchema } from './identifiers';
import { ApiFailure } from './apiFailure';
import type { CredentialVault, Principal } from './credentials';
import type { TenantContext } from './tenantContext';
import type { RequestOptions } from './httpTypes';

async function customerHeaders(
  context: TenantContext,
  vault: CredentialVault,
  principal: Principal | undefined,
): Promise<Record<string, string>> {
  if (principal?.kind !== 'customer') throw new ApiFailure(401, 'refused');
  const session = await vault.session(context, principal.id);
  if (!session) throw new ApiFailure(401, 'refused');
  return { Authorization: `Bearer ${session.accessToken}` };
}

async function sessionHeaders(
  context: TenantContext,
  vault: CredentialVault,
  principal: Principal | undefined,
  mode: 'basket' | 'guest' | 'table',
): Promise<Record<string, string>> {
  if (!principal || (mode !== 'basket' && principal.kind !== 'guest'))
    throw new ApiFailure(401, 'refused');
  const session = await vault.capability(context, 'guest-session', principal);
  if (!session) throw new ApiFailure(401, 'refused');
  if (mode === 'basket' && !canonicalUuidSchema.safeParse(session).success)
    throw new ApiFailure(401, 'refused');
  const headers: Record<string, string> = { 'X-Session-Id': session };
  if (mode === 'table') {
    const participant = await vault.capability(context, 'table-participant', principal);
    if (!participant) throw new ApiFailure(401, 'refused');
    headers['X-Table-Participant'] = participant;
  }
  return headers;
}

export async function requestHeaders(
  context: TenantContext,
  vault: CredentialVault,
  options: RequestOptions,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.locale) headers['Accept-Language'] = options.locale;
  const mode = options.credentials ?? 'none';
  const principal = options.principal ? Object.freeze({ ...options.principal }) : undefined;
  if (mode === 'customer' || (mode === 'basket' && principal?.kind === 'customer'))
    Object.assign(headers, await customerHeaders(context, vault, principal));
  if (mode === 'guest' || mode === 'table' || mode === 'basket')
    Object.assign(headers, await sessionHeaders(context, vault, principal, mode));
  return headers;
}
