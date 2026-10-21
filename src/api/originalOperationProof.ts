import { z } from 'zod';
import { canonicalUuidSchema } from '../core/identifiers';

export const originalOperationProofSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: canonicalUuidSchema,
  tenantId: canonicalUuidSchema,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  ownerProof: z
    .string()
    .min(1)
    .max(4096)
    .regex(/^[a-zA-Z0-9_-]+$/),
});
