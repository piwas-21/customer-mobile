import { ApiFailure } from './apiFailure';
import type { CredentialVault } from './credentials';
import type { TenantContext } from './tenantContext';
import type { RequestOptions } from './httpTypes';
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
  if (mode === 'customer') {
    if (principal?.kind !== 'customer') throw new ApiFailure(401, 'refused');
    const session = await vault.session(context, principal.id);
    if (!session) throw new ApiFailure(401, 'refused');
    headers.Authorization = `Bearer ${session.accessToken}`;
  }
  if (mode !== 'guest' && mode !== 'table') return headers;
  if (principal?.kind !== 'guest') throw new ApiFailure(401, 'refused');
  const session = await vault.capability(context, 'guest-session', principal);
  if (!session) throw new ApiFailure(401, 'refused');
  headers['X-Session-Id'] = session;
  if (mode === 'table') {
    const participant = await vault.capability(context, 'table-participant', principal);
    if (!participant) throw new ApiFailure(401, 'refused');
    headers['X-Table-Participant'] = participant;
  }
  return headers;
}
