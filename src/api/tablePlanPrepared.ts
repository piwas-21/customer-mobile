import { z } from 'zod';
import { originalOperationProofSchema } from './originalOperationProof';
import { canonicalUuidSchema } from '../core/identifiers';
import { tableAccountRevision } from './tableAccountContract';
import { tablePaymentAllocationSchema } from './tablePaymentAccountContract';
import { tablePaymentCurrency, tablePaymentMinor } from '../domain/tablePaymentMoney';
import { TableAllocationIndex } from '../domain/tableAllocationIndex';
import { tableShareAmounts } from '../domain/tableShareAmounts';
import { tablePlanIntentSchema, type TablePlanIntent } from './tablePlanIntent';
import { ApiFailure } from '../core/apiFailure';
export const tablePlanPreparedSchema = z.strictObject({
  schemaVersion: z.literal(1),
  proof: originalOperationProofSchema,
  serviceSessionId: canonicalUuidSchema,
  accountRevision: tableAccountRevision,
  totalMinor: tablePaymentMinor.min(1),
  currency: tablePaymentCurrency,
  roundingIncrementMinor: z.union([z.literal(1), z.literal(5)]),
  scope: z.array(tablePaymentAllocationSchema).min(1).max(5_000),
  sharesMinor: z.array(tablePaymentMinor.min(1)).min(2).max(100),
});
export type TablePlanPrepared = z.infer<typeof tablePlanPreparedSchema>;
export function bindPreparedTablePlan(input: TablePlanIntent, currency: string, value: unknown) {
  const intent = tablePlanIntentSchema.parse(input);
  const prepared = tablePlanPreparedSchema.parse(value);
  const scope = new TableAllocationIndex(prepared.scope);
  const shares = tableShareAmounts(
    BigInt(prepared.totalMinor),
    intent.shareCount,
    currency,
    intent.customAmountsMinor,
  );
  const equalIncrement = currency === 'CHF' || currency === 'EUR' ? 5 : 1;
  const increment = intent.customAmountsMinor.length ? 1 : equalIncrement;
  if (
    prepared.proof.tenantId !== intent.tenantId ||
    prepared.proof.operationId !== intent.operationId ||
    prepared.serviceSessionId !== intent.serviceSessionId ||
    prepared.accountRevision !== intent.expectedAccountRevision ||
    prepared.currency !== currency ||
    prepared.roundingIncrementMinor !== increment ||
    scope.total !== BigInt(prepared.totalMinor) ||
    prepared.sharesMinor.length !== shares.length ||
    prepared.sharesMinor.some((amount, index) => BigInt(amount) !== shares[index])
  )
    throw new ApiFailure(200, 'contract');
  return prepared;
}
