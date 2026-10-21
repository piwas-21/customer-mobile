import { canUse, type Bootstrap } from '../core/capabilities';
import {
  captureTablePaymentScope,
  tablePaymentAccountPath,
  type TablePaymentReadScope,
} from '../core/tablePaymentReadScope';
import type { TenantContext } from '../core/tenantContext';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import { assertTableVisitEnabled } from './tableVisits';
import { tablePaymentAccountSchema } from './tablePaymentAccountContract';

export async function readTablePaymentAccount(
  client: CustomerTransport,
  context: TenantContext,
  bootstrap: Bootstrap,
  input: TablePaymentReadScope,
  assertCurrent: () => void,
  locale: string,
) {
  assertTableVisitEnabled(context, bootstrap);
  const principal = input.visit.principal;
  const scope = captureTablePaymentScope(context, principal, input);
  if (
    bootstrap.flags.tableAccountPaymentsV1 !== true ||
    scope.currency !== bootstrap.currency ||
    (principal.kind === 'customer' && !canUse(bootstrap, 'accounts'))
  )
    throw new ApiFailure(409, 'refused');
  assertCurrent();
  const result = await client.request(
    context,
    tablePaymentAccountPath(context, scope),
    tablePaymentAccountSchema,
    {
      method: 'GET',
      credentials: 'table-payment-account',
      principal: scope.visit.principal,
      expectedTablePaymentAccount: scope,
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  if (
    result.tenantId !== context.tenant.id ||
    result.account.serviceSessionId !== scope.visit.identity.serviceSessionId ||
    result.account.currency !== scope.currency ||
    Date.parse(scope.visit.identity.expiresAt) <= Date.now()
  )
    throw new ApiFailure(200, 'contract');
  return result;
}
