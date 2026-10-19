import { checkoutQuote, checkoutQuoteFixture } from './checkoutQuote';
import { currentBasketOwner, basketOperationId } from './basketOperations';
import type { CheckoutIntent } from '../api/checkoutIntent';
export function checkoutIntent(): CheckoutIntent {
  const quote = checkoutQuote();
  return {
    review: {
      schemaVersion: 1,
      expectedBasketId: quote.basketId,
      expectedPurchaseFingerprint: quote.purchaseFingerprint,
      type: quote.type,
      pointsToRedeem: 0,
      tip: 3,
    },
    expectedQuoteFingerprint: quote.quoteFingerprint,
    contact: { name: 'Fixture guest', email: 'native@example.test', phone: '+41000000000' },
    paymentMethod: 'Cash',
  };
}
export async function customerOrderFixture(customer = false) {
  const f = await checkoutQuoteFixture(customer);
  const pending = await f.repository.orders.prepare(
    f.context,
    f.principal,
    { intent: checkoutIntent(), payloadHash: 'c'.repeat(64) },
    () => basketOperationId,
    currentBasketOwner,
  );
  return { ...f, pending };
}
export function appliedOrder() {
  return {
    schemaVersion: 1,
    operationId: basketOperationId,
    outcome: 'Applied',
    orderId: checkoutQuote().basketId,
  };
}
