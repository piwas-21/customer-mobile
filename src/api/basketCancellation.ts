import { z } from 'zod';
import { basketResponseSchema } from './basketResponse';
import { basketOperationRequest } from './basketOperationRequest';
import { assertBasketOperationResult } from './basketOperationProof';
import { canonicalUuidSchema } from '../core/identifiers';
import type { PendingBasketOperation } from '../core/basketOperationRecord';
import type { TenantContext } from '../core/tenantContext';
import { ApiFailure, type CustomerTransport } from '../core/transport';
const resolutionSchema = z
  .object({
    operationId: canonicalUuidSchema,
    outcome: z.enum(['Applied', 'Cancelled']),
    basket: basketResponseSchema.nullable().optional(),
  })
  .strict();
export type BasketOperationResolution = {
  operationId: string;
  outcome: 'Applied' | 'Cancelled';
  basket: z.infer<typeof basketResponseSchema> | null;
};
export async function cancelBasketOperation(
  client: CustomerTransport,
  context: TenantContext,
  pending: PendingBasketOperation,
  assertCurrent: () => void,
  locale: string,
): Promise<BasketOperationResolution> {
  const { operation, request } = basketOperationRequest(context, pending);
  if (!operation.cancellationRequested) throw new ApiFailure(0, 'refused');
  assertCurrent();
  const resolution = await client.request(context, `${request.path}/cancel`, resolutionSchema, {
    method: 'POST',
    credentials: 'basket',
    principal: operation.principal,
    expectedBasketSessionId: operation.sessionId,
    body: request.body,
    assertCurrent,
    locale,
  });
  assertCurrent();
  const basket = resolution.basket ?? null;
  if (
    resolution.operationId !== operation.operationId ||
    (resolution.outcome === 'Cancelled' && basket !== null)
  )
    throw new ApiFailure(200, 'contract');
  if (basket !== null) {
    assertBasketOperationResult(basket, operation);
  }
  return { ...resolution, basket };
}
