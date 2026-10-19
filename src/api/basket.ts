import { basketResponseSchema, type CustomerBasket } from './basketResponse';
import {
  basketOperationRecordSchema,
  type PendingBasketOperation,
} from '../core/basketOperationRecord';
import { ApiFailure, type CustomerTransport } from '../core/transport';
import type { TenantContext } from '../core/tenantContext';
import { canonicalUuidSchema } from '../core/identifiers';
import { principalSchema, type Principal } from '../core/credentials';
import { assertOwnedBasket } from './basketOwnership';

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
  assertOwnedBasket(basket, operation.principal, operation.sessionId);
  return basket;
}

// A read never acknowledges an unresolved operation, even when its line appears in the basket.
export async function readBasket(
  client: CustomerTransport,
  context: TenantContext,
  principal: Principal,
  sessionId: string,
  assertCurrent: () => void,
  locale: string,
): Promise<CustomerBasket> {
  const owner = principalSchema.parse(principal);
  const session = canonicalUuidSchema.parse(sessionId);
  assertCurrent();
  const basket = await client.request(
    context,
    '/api/customer-mobile/basket',
    basketResponseSchema,
    {
      credentials: 'basket',
      principal: owner,
      expectedBasketSessionId: session,
      assertCurrent,
      locale,
    },
  );
  assertCurrent();
  assertOwnedBasket(basket, owner, session, true);
  return basket;
}
