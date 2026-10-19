import type { CustomerBasket } from './basketResponse';
import { assertOwnedBasket } from './basketOwnership';
import type { PendingBasketOperation } from '../core/basketOperationRecord';
import { emptyUuid } from '../core/identifiers';
import { ApiFailure } from '../core/transport';
export function assertBasketOperationResult(
  basket: CustomerBasket,
  operation: PendingBasketOperation,
) {
  assertOwnedBasket(basket, operation.principal, operation.sessionId);
  const expected = operation.schemaVersion === 1 ? emptyUuid : operation.request.expectedBasketId;
  if (expected !== emptyUuid && basket.id !== expected) throw new ApiFailure(200, 'contract');
}
