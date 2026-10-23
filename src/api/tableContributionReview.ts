import { bindPreparedTablePayment } from './tablePaymentPrepared';
import type { TablePaymentAccount } from './tablePaymentAccountContract';
import { tableContributionSelection } from '../domain/tableContributionSelection';
import { scopedTablePaymentPreparation } from '../core/tablePaymentPreparation';
import { requireTableContributionEnabled } from '../core/tableContributionPolicy';
import type { TableVisitRecord } from '../core/tableVisitRecord';
import type { TenantContext } from '../core/tenantContext';
import type { Bootstrap } from '../core/capabilities';
import type { Principal } from '../core/credentials';
import { ApiFailure } from '../core/apiFailure';
export function tableContributionReview(
  context: TenantContext,
  input: {
    principal: Principal;
    sessionId: string;
    visit: TableVisitRecord;
    account: TablePaymentAccount;
    bootstrap: Bootstrap;
    operationId: string;
    choice: unknown;
  },
) {
  const bootstrap = requireTableContributionEnabled(context, input.bootstrap, input.principal);
  const selected = tableContributionSelection(input.account, input.operationId, input.choice);
  const preparation = scopedTablePaymentPreparation(context, input.principal, {
    schemaVersion: 1,
    environment: context.environment,
    tenantId: context.tenant.id,
    principal: input.principal,
    sessionId: input.sessionId,
    visit: input.visit,
    intent: selected.intent,
    currency: bootstrap.currency,
  });
  if (selected.intent.tenantId !== context.tenant.id || selected.currency !== preparation.currency)
    throw new ApiFailure(200, 'contract');
  return {
    preparation,
    amountMinor: selected.amountMinor,
    accept(value: unknown) {
      scopedTablePaymentPreparation(context, input.principal, preparation);
      const prepared = bindPreparedTablePayment(preparation.intent, preparation.currency, value);
      selected.requireAllocations(prepared.allocations);
      return prepared;
    },
  };
}
