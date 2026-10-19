import { basketResponseSchema, type CustomerBasket } from './basketResponse';
import {
  basketOperationRecordSchema,
  type PendingBasketOperation,
} from '../core/basketOperationRecord';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
import { canonicalUuidSchema } from '../core/identifiers';

// No legacy-route fallback or automatic retry: this URL exists only with durable server operations.
export async function submitBasketOperation(
  client: CustomerTransport,
  context: TenantContext,
  pending: PendingBasketOperation,
  assertCurrent: () => void,
  locale: string,
): Promise<CustomerBasket> {
  const operation = basketOperationRecordSchema.parse(pending);
  if (
    operation.phase !== 'ready' ||
    operation.environment !== context.environment ||
    operation.tenantId !== context.tenant.id
  )
    throw new ApiFailure(0, 'refused');
  assertCurrent();
  const basket = await client.request(
    context,
    '/api/customer-mobile/basket/items',
    basketResponseSchema,
    {
      method: 'POST',
      credentials: 'basket',
      principal: operation.principal,
      expectedBasketSessionId: operation.sessionId,
      body: { ...operation.request, operationId: operation.operationId },
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  const owned =
    operation.principal.kind === 'customer'
      ? basket.userId?.toLowerCase() === operation.principal.id.toLowerCase()
      : basket.userId === null && basket.sessionId === operation.sessionId;
  if (!owned || !canonicalUuidSchema.safeParse(basket.id).success || !basket.purchaseFingerprint)
    throw new ApiFailure(200, 'contract');
  return basket;
}
