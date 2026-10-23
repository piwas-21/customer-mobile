import { originalTableHeaders } from './originalTableHeaders';
import { scopedTablePlan } from './tablePlanRecord';
import { scopedTablePlanPreparation } from './tablePlanPreparation';
import { ApiFailure } from './apiFailure';
import type { CredentialVault } from './credentials';
import type { RequestOptions } from './httpTypes';
import type { TenantContext } from './tenantContext';
export function tablePlanHeaders(
  context: TenantContext,
  vault: CredentialVault,
  options: RequestOptions,
) {
  const principal = options.principal;
  if (!principal) throw new ApiFailure(401, 'refused');
  return originalTableHeaders(context, vault, options, {
    kind: 'table-plan-operation',
    record: options.expectedPlanRecord,
    preparation: options.expectedPlanPreparation,
    renewal: options.credentials === 'table-plan-renewal',
    captureRecord: (value) => scopedTablePlan(context, principal, value),
    capturePreparation: (value) => scopedTablePlanPreparation(context, principal, value),
  });
}
