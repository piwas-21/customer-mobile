import { privateTableCustomerHeaders, tablePreparationHeaders } from './privateTableHeaders';
import { ApiFailure } from './apiFailure';
import type { CredentialVault } from './credentials';
import type { RequestOptions } from './httpTypes';
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
    Object.assign(
      headers,
      await tablePreparationHeaders(context, vault, options, preparation, () =>
        scopedRoundPreparation(context, principal, preparation),
      ),
    );
  }
  Object.assign(
    headers,
    await privateTableCustomerHeaders(
      context,
      vault,
      options,
      options.credentials === 'table-round-renewal',
    ),
  );
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
