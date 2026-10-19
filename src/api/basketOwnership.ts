import type { CustomerBasket } from './basketResponse';
import type { Principal } from '../core/credentials';
import { canonicalUuidSchema, emptyUuid } from '../core/identifiers';
import { ApiFailure } from '../core/transport';
export const emptyBasketId = emptyUuid;
export function assertOwnedBasket(
  basket: CustomerBasket,
  principal: Principal,
  sessionId: string,
  allowEmpty = false,
): void {
  if (allowEmpty && basket.id === emptyBasketId) {
    const empty =
      basket.userId === null &&
      basket.sessionId === sessionId &&
      basket.items.length === 0 &&
      basket.totalItems === 0 &&
      basket.orderType === null &&
      basket.customerDiscountName == null &&
      basket.purchaseFingerprint === '' &&
      [
        basket.subTotal,
        basket.tax,
        basket.deliveryFee,
        basket.discount,
        basket.customerDiscount,
        basket.total,
      ].every((amount) => amount === 0);
    if (!empty) throw new ApiFailure(200, 'contract');
    return;
  }
  const owned =
    principal.kind === 'customer'
      ? basket.userId?.toLowerCase() === principal.id.toLowerCase()
      : basket.userId === null && basket.sessionId === sessionId;
  if (!owned || !canonicalUuidSchema.safeParse(basket.id).success || !basket.purchaseFingerprint)
    throw new ApiFailure(200, 'contract');
}
