import { tableReviewPreparation } from '../core/tablePreparationAuthority';
import { bindPreparedTablePlan } from './tablePlanPrepared';
import { tablePlanSelection } from '../domain/tablePlanSelection';
import { scopedTablePlanPreparation } from '../core/tablePlanPreparation';
import { requireTableContributionEnabled } from '../core/tableContributionPolicy';
import { ApiFailure } from '../core/apiFailure';
import type { tableContributionReview } from './tableContributionReview';
import type { TenantContext } from '../core/tenantContext';
export function tablePlanReview(
  context: TenantContext,
  input: Parameters<typeof tableContributionReview>[1],
) {
  const bootstrap = requireTableContributionEnabled(context, input.bootstrap, input.principal);
  const selected = tablePlanSelection(input.account, input.operationId, input.choice);
  const preparation = scopedTablePlanPreparation(
    context,
    input.principal,
    tableReviewPreparation(context, input, selected, bootstrap.currency),
  );
  return {
    preparation,
    accept(value: unknown) {
      scopedTablePlanPreparation(context, preparation.principal, preparation);
      const prepared = bindPreparedTablePlan(preparation.intent, preparation.currency, value);
      if (prepared.totalMinor !== selected.totalMinor) throw new ApiFailure(200, 'contract');
      selected.requireScope(prepared.scope);
      return prepared;
    },
  };
}
