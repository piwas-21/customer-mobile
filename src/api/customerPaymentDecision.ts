import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';
// Source-only additive contract from backend #743; the deployed OpenAPI snapshot stays separate.
export const customerPaymentDecisionSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    operationId: canonicalUuidSchema,
    orderId: canonicalUuidSchema,
    outcome: z.enum(['ready', 'pending', 'paid', 'expired', 'failed']),
    checkoutUrl: z.string().min(1).max(8192).nullable(),
    expiresAt: z.iso.datetime({ offset: true }).max(64),
  })
  .refine((value) => (value.outcome === 'ready') === (value.checkoutUrl !== null));
export type CustomerPaymentDecision = z.infer<typeof customerPaymentDecisionSchema>;
