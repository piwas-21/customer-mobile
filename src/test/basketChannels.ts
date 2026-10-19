import type { BasketChannelInput } from '../api/basketChannel';
import { basketResponse } from './basketApi';
import { emptyUuid } from '../core/identifiers';
export function channelInput(empty = false): BasketChannelInput {
  const basket = basketResponse();
  return {
    expectedBasketId: empty ? emptyUuid : basket.id,
    expectedPurchaseFingerprint: empty ? '' : basket.purchaseFingerprint,
    orderType: 'Takeaway',
    confirmedConflictItemIds: [],
  };
}
