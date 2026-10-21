import { ApiFailure } from './apiFailure';
import type { CredentialVault } from './credentials';
import type { RequestOptions } from './httpTypes';
import { refreshCredentialsSchema } from './refreshCredentials';
import { tableAccountHeaders } from './tableAccountRequest';
import { scopedRoundPreparation } from './tableRoundPreparation';
import { scopedTableRound } from './tableRoundRecord';
import type { TenantContext } from './tenantContext';

export async function tableRoundHeaders(
  context: TenantContext,
  vault: CredentialVault,
  options: RequestOptions,
): Promise<Record<string, string>> {
  if (!options.principal || !options.assertCurrent) throw new ApiFailure(401, 'refused');
  const principal = options.principal;
  const record =
    options.expectedRoundRecord === undefined
      ? null
      : scopedTableRound(context, principal, options.expectedRoundRecord);
  const preparation =
    options.expectedRoundPreparation === undefined
      ? null
      : scopedRoundPreparation(context, principal, options.expectedRoundPreparation);
  if (!record && !preparation) throw new ApiFailure(401, 'refused');
  const headers: Record<string, string> = {
    'X-Session-Id': record?.sessionId ?? preparation!.sessionId,
  };
  if (preparation) {
    const sessionId = await vault.capability(context, 'guest-session', principal);
    options.assertCurrent();
    if (sessionId !== preparation.sessionId) throw new ApiFailure(401, 'refused');
    Object.assign(
      headers,
      await tableAccountHeaders(context, vault, {
        ...options,
        expectedTableVisit: preparation.visit,
      }),
    );
    scopedRoundPreparation(context, principal, preparation);
  }
  if (principal.kind === 'customer') {
    const session = await vault.session(context, principal.id);
    options.assertCurrent();
    if (!session) throw new ApiFailure(401, 'refused');
    if (options.credentials === 'table-round-renewal') {
      const body = refreshCredentialsSchema.parse(options.body);
      if (body.accessToken !== session.accessToken || body.refreshToken !== session.refreshToken)
        throw new ApiFailure(401, 'refused');
    } else headers.Authorization = `Bearer ${session.accessToken}`;
  }
  if (record) {
    const raw = await vault.capability(context, 'table-round-operation', principal);
    options.assertCurrent();
    const saved = scopedTableRound(context, principal, raw === null ? null : JSON.parse(raw));
    if (JSON.stringify(saved) !== JSON.stringify(record)) throw new ApiFailure(401, 'refused');
  }
  if (preparation) scopedRoundPreparation(context, principal, preparation);
  options.assertCurrent();
  return headers;
}
