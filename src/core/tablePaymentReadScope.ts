import { z } from 'zod';
import { tablePaymentCurrency } from '../domain/tablePaymentMoney';
import { canonicalUuidSchema } from './identifiers';
import type { Principal } from './credentials';
import { scopedTableVisit, type TableVisitRecord } from './tableVisitRecord';
import type { TenantContext } from './tenantContext';

export type TablePaymentReadScope = Readonly<{
  sessionId: string;
  currency: z.infer<typeof tablePaymentCurrency>;
  visit: TableVisitRecord;
}>;
const inputSchema = z.strictObject({
  sessionId: canonicalUuidSchema,
  currency: tablePaymentCurrency,
  visit: z.unknown(),
});
export function captureTablePaymentScope(
  context: TenantContext,
  principal: Principal,
  input: unknown,
): TablePaymentReadScope {
  const captured = inputSchema.parse(input);
  return Object.freeze({
    ...captured,
    visit: scopedTableVisit(context, principal, captured.visit),
  });
}
export function tablePaymentAccountPath(context: TenantContext, scope: TablePaymentReadScope) {
  return (
    '/api/customer-mobile/table-payments/account?schemaVersion=1&tenantId=' +
    context.tenant.id +
    '&serviceSessionId=' +
    scope.visit.identity.serviceSessionId
  );
}
