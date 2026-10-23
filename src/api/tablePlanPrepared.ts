import { z } from 'zod';
import { originalOperationProofSchema } from './originalOperationProof';
import { canonicalUuidSchema } from '../core/identifiers';
import { tableAccountRevision } from './tableAccountContract';
import { tablePaymentAllocationSchema } from './tablePaymentAccountContract';
import { TableAllocationIndex } from '../domain/tableAllocationIndex';
import { tablePlanMoneySchema, requireTablePlanMoney } from './tablePlanMoney';
import { tablePlanIntentSchema, type TablePlanIntent } from './tablePlanIntent';
import { ApiFailure } from '../core/apiFailure';
export const tablePlanPreparedSchema = z.strictObject({
  schemaVersion: z.literal(1),
  proof: originalOperationProofSchema,
  serviceSessionId: canonicalUuidSchema,
  accountRevision: tableAccountRevision,
  ...tablePlanMoneySchema.shape,
  scope: z.array(tablePaymentAllocationSchema).min(1).max(5_000),
});
export type TablePlanPrepared = z.infer<typeof tablePlanPreparedSchema>;
export function bindPreparedTablePlan(input: TablePlanIntent, currency: string, value: unknown) {
  const intent = tablePlanIntentSchema.parse(input);
  const prepared = tablePlanPreparedSchema.parse(value);
  const scope = new TableAllocationIndex(prepared.scope);
  requireTablePlanMoney(intent, prepared);
  if (
    prepared.proof.tenantId !== intent.tenantId ||
    prepared.proof.operationId !== intent.operationId ||
    prepared.serviceSessionId !== intent.serviceSessionId ||
    prepared.accountRevision !== intent.expectedAccountRevision ||
    prepared.currency !== currency ||
    scope.total !== BigInt(prepared.totalMinor)
  )
    throw new ApiFailure(200, 'contract');
  return prepared;
}
