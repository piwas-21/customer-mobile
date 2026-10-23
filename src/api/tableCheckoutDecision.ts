import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
import { utcSortMarkerSchema } from '../core/utcSortMarker';
import { tablePaymentCurrency, tablePaymentMinor } from '../domain/tablePaymentMoney';
import { ApiFailure } from '../core/apiFailure';
export const tableCheckoutDecisionSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    tenantId: canonicalUuidSchema,
    operationId: canonicalUuidSchema,
    serviceSessionId: canonicalUuidSchema,
    attemptId: canonicalUuidSchema.nullable(),
    outcome: z.enum(['reserved', 'pending', 'ready', 'paid', 'stopped']),
    amountMinor: tablePaymentMinor.min(1),
    currency: tablePaymentCurrency,
    expiresAt: utcSortMarkerSchema.nullable(),
    checkoutUrl: z.string().min(1).max(8192).nullable(),
  })
  .superRefine((value, issues) => {
    if (
      (value.outcome === 'ready') !== (value.checkoutUrl !== null) ||
      (value.outcome !== 'stopped' && value.attemptId === null) ||
      (['ready', 'paid'].includes(value.outcome) && value.expiresAt === null)
    )
      issues.addIssue({ code: 'custom', message: 'Incomplete original checkout decision' });
  });
export type TableCheckoutDecision = z.infer<typeof tableCheckoutDecisionSchema>;
export function bindTableCheckoutDecision(
  expected: Pick<
    TableCheckoutDecision,
    | 'tenantId'
    | 'operationId'
    | 'serviceSessionId'
    | 'attemptId'
    | 'amountMinor'
    | 'currency'
    | 'expiresAt'
  >,
  value: unknown,
) {
  const result = tableCheckoutDecisionSchema.parse(value);
  if (
    result.tenantId !== expected.tenantId ||
    result.operationId !== expected.operationId ||
    result.serviceSessionId !== expected.serviceSessionId ||
    result.attemptId !== expected.attemptId ||
    result.amountMinor !== expected.amountMinor ||
    result.currency !== expected.currency ||
    (expected.expiresAt !== null && result.expiresAt !== expected.expiresAt)
  )
    throw new ApiFailure(200, 'contract');
  return result;
}
