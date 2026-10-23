import { z } from 'zod';
import { originalOperationProofSchema } from './originalOperationProof';
import { tableAccountRevision } from './tableAccountContract';
import { tablePaymentAllocationSchema } from './tablePaymentAccountContract';
import { tablePaymentCurrency, tablePaymentMinor } from '../domain/tablePaymentMoney';
import { canonicalUuidSchema } from '../core/identifiers';
import {
  tablePaymentIntentSchema,
  tablePaymentModeSchema,
  type TablePaymentIntent,
} from './tablePaymentIntent';
import { ApiFailure } from '../core/apiFailure';
export const tablePaymentPreparedSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    proof: originalOperationProofSchema,
    serviceSessionId: canonicalUuidSchema,
    accountRevision: tableAccountRevision,
    mode: tablePaymentModeSchema,
    amountMinor: tablePaymentMinor.min(1),
    currency: tablePaymentCurrency,
    allocations: z.array(tablePaymentAllocationSchema).min(1).max(5_000),
  })
  .superRefine((value, issues) => {
    const total = value.allocations.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
    if (
      total !== BigInt(value.amountMinor) ||
      value.allocations.some(
        (row) => BigInt(row.unitCount) * BigInt(row.minorPerUnit) !== BigInt(row.amountMinor),
      )
    )
      issues.addIssue({ code: 'custom', message: 'Inconsistent reviewed contribution money' });
  });
export type TablePaymentPrepared = z.infer<typeof tablePaymentPreparedSchema>;
export function bindPreparedTablePayment(
  input: TablePaymentIntent,
  currency: string,
  value: unknown,
) {
  const intent = tablePaymentIntentSchema.parse(input);
  const prepared = tablePaymentPreparedSchema.parse(value);
  if (
    prepared.proof.tenantId !== intent.tenantId ||
    prepared.proof.operationId !== intent.operationId ||
    prepared.serviceSessionId !== intent.serviceSessionId ||
    prepared.accountRevision !== intent.expectedAccountRevision ||
    prepared.currency !== currency ||
    prepared.mode !== intent.mode ||
    (intent.mode === 'Amount' && intent.amountMinor !== prepared.amountMinor) ||
    (intent.mode === 'Items' && !sameSelectedUnits(intent, prepared))
  )
    throw new ApiFailure(200, 'contract');
  return prepared;
}

function sameSelectedUnits(intent: TablePaymentIntent, prepared: TablePaymentPrepared) {
  const selected = intent.selectedUnits.map((row) =>
    JSON.stringify([row.orderId, row.orderItemId, row.ordinal]),
  );
  const returned = new Set(
    prepared.allocations.map((row) =>
      JSON.stringify([row.orderId, row.orderItemId, row.startOrdinal]),
    ),
  );
  return (
    prepared.allocations.every((row) => row.unitCount === 1) &&
    returned.size === prepared.allocations.length &&
    selected.length === returned.size &&
    selected.every((key) => returned.has(key))
  );
}
