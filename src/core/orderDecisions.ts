import { z } from 'zod';
import { canonicalUuidSchema } from './identifiers';
import { assertOrderProofScope, orderOperationProofSchema } from './orderOperationProof';
import type { TenantContext } from './tenantContext';
import type { Principal } from './credentials';
export const savedOrderLimit = 32;
export const orderDecisionSchema = orderOperationProofSchema
  .extend({
    outcome: z.enum(['Applied', 'Cancelled']),
    orderId: canonicalUuidSchema.nullable(),
    recordedAt: z.iso.datetime().optional(),
  })
  .refine((value) => (value.outcome === 'Applied') === (value.orderId !== null));
export const orderDecisionsSchema = z
  .array(orderDecisionSchema)
  .max(savedOrderLimit)
  .refine((values) => new Set(values.map((value) => value.operationId)).size === values.length);
export type OrderDecision = z.infer<typeof orderDecisionSchema>;

export function scopedOrderDecisions(
  context: TenantContext,
  principal: Principal,
  value: unknown,
): OrderDecision[] {
  const decisions = orderDecisionsSchema.parse(value);
  for (const decision of decisions) {
    assertOrderProofScope(context, decision);
    if (decision.principal.kind !== principal.kind || decision.principal.id !== principal.id)
      throw new Error('Saved order owner changed');
  }
  return decisions;
}
export function decisionProof(decision: OrderDecision) {
  return orderOperationProofSchema.parse({
    schemaVersion: decision.schemaVersion,
    environment: decision.environment,
    tenantId: decision.tenantId,
    principal: decision.principal,
    sessionId: decision.sessionId,
    operationId: decision.operationId,
    payloadHash: decision.payloadHash,
    cancellationRequested: decision.cancellationRequested,
    ...(decision.onlinePayment ? { onlinePayment: true } : {}),
  });
}
