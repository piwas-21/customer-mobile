import { z } from 'zod';
import { canonicalUuidSchema } from './identifiers';
import { orderOperationProofSchema } from './orderOperationProof';
export const savedOrderLimit = 32;
export const orderDecisionSchema = orderOperationProofSchema
  .extend({
    outcome: z.enum(['Applied', 'Cancelled']),
    orderId: canonicalUuidSchema.nullable(),
  })
  .refine((value) => (value.outcome === 'Applied') === (value.orderId !== null));
export const orderDecisionsSchema = z
  .array(orderDecisionSchema)
  .max(savedOrderLimit)
  .refine((values) => new Set(values.map((value) => value.operationId)).size === values.length);
export type OrderDecision = z.infer<typeof orderDecisionSchema>;
