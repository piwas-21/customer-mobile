import { z } from 'zod';
import { originalOperationProofSchema } from '../api/originalOperationProof';
import { tablePaymentIntentSchema, tablePaymentModeSchema } from '../api/tablePaymentIntent';
import { tablePaymentResolutionSchema } from '../api/tablePaymentResolution';
import { tablePaymentCurrency, tablePaymentMinor } from '../domain/tablePaymentMoney';
import { principalSchema, type Principal } from './credentials';
import { environmentSchema } from './directory';
import { canonicalUuidSchema } from './identifiers';
import { utcSortMarkerSchema } from './utcSortMarker';
import { ApiFailure } from './apiFailure';
import type { TenantContext } from './tenantContext';
const checkoutState = z.strictObject({
  outcome: z.enum(['reserved', 'pending', 'paid', 'stopped']),
  expiresAt: utcSortMarkerSchema.nullable(),
});
export const tablePaymentRecordSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    environment: environmentSchema,
    tenantId: canonicalUuidSchema,
    principal: principalSchema,
    sessionId: canonicalUuidSchema,
    intent: tablePaymentIntentSchema,
    proof: originalOperationProofSchema,
    cancellationRequested: z.boolean(),
    review: z.strictObject({
      mode: tablePaymentModeSchema,
      amountMinor: tablePaymentMinor.min(1),
      currency: tablePaymentCurrency,
    }),
    resolution: tablePaymentResolutionSchema.nullable(),
    checkout: checkoutState.nullable(),
  })
  .superRefine((record, issues) => {
    const { intent, proof, resolution, checkout } = record;
    if (
      intent.tenantId !== record.tenantId ||
      proof.tenantId !== record.tenantId ||
      proof.operationId !== intent.operationId ||
      record.review.mode !== intent.mode ||
      (intent.mode === 'Amount' && intent.amountMinor !== record.review.amountMinor) ||
      (resolution &&
        (resolution.outcome === 'Unseen' ||
          resolution.operationId !== intent.operationId ||
          resolution.serviceSessionId !== intent.serviceSessionId)) ||
      (checkout && resolution?.outcome !== 'Applied') ||
      (checkout?.outcome === 'paid' && checkout.expiresAt === null)
    )
      issues.addIssue({ code: 'custom', message: 'Unbound original contribution record' });
  });
export type TablePaymentRecord = z.infer<typeof tablePaymentRecordSchema>;
export function scopedTablePayment(context: TenantContext, principal: Principal, value: unknown) {
  const owner = principalSchema.parse(principal);
  const record = tablePaymentRecordSchema.parse(value);
  if (
    record.environment !== context.environment ||
    record.tenantId !== context.tenant.id ||
    record.principal.kind !== owner.kind ||
    record.principal.id !== owner.id
  )
    throw new ApiFailure(403, 'refused');
  return record;
}
export function tablePaymentResolved(record: TablePaymentRecord) {
  return (
    record.resolution?.outcome === 'Stopped' ||
    record.checkout?.outcome === 'paid' ||
    record.checkout?.outcome === 'stopped'
  );
}
