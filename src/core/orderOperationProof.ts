import { z } from 'zod';
import { principalSchema } from './credentials';
import { environmentSchema } from './directory';
import { canonicalUuidSchema } from './identifiers';
import type { TenantContext } from './tenantContext';
export const orderOperationProofSchema = z.strictObject({
  schemaVersion: z.literal(1),
  environment: environmentSchema,
  tenantId: canonicalUuidSchema,
  principal: principalSchema,
  sessionId: canonicalUuidSchema,
  operationId: canonicalUuidSchema,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  cancellationRequested: z.boolean(),
  // Older clients could only submit cash. This non-contact marker survives contact cleanup.
  onlinePayment: z.literal(true).optional(),
});
export type OrderOperationProof = Readonly<z.infer<typeof orderOperationProofSchema>>;
export function assertOrderProofScope(context: TenantContext, proof: OrderOperationProof): void {
  if (
    context.signal.aborted ||
    proof.environment !== context.environment ||
    proof.tenantId !== context.tenant.id
  )
    throw new Error('Order operation scope changed');
}
