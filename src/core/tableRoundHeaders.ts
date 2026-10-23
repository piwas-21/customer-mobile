import { originalTableHeaders } from './originalTableHeaders';
import { scopedTableRound } from './tableRoundRecord';
import { scopedRoundPreparation } from './tableRoundPreparation';
import { ApiFailure } from './apiFailure';
import type { CredentialVault } from './credentials';
import type { RequestOptions } from './httpTypes';
import type { TenantContext } from './tenantContext';
export function tableRoundHeaders(
  context: TenantContext,
  vault: CredentialVault,
  options: RequestOptions,
) {
  const principal = options.principal;
  if (!principal) throw new ApiFailure(401, 'refused');
  return originalTableHeaders(context, vault, options, {
    kind: 'table-round-operation',
    record: options.expectedRoundRecord,
    preparation: options.expectedRoundPreparation,
    renewal: options.credentials === 'table-round-renewal',
    captureRecord: (value) => scopedTableRound(context, principal, value),
    capturePreparation: (value) => scopedRoundPreparation(context, principal, value),
  });
}
