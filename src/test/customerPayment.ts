import { checkoutQuoteFixture } from './checkoutQuote';
import { appliedOrder, checkoutIntent } from './customerOrder';
import { basketOperationId, currentBasketOwner } from './basketOperations';
import type { CustomerPaymentDecision } from '../api/customerPaymentDecision';
export async function paymentFixture(customer = false) {
  const f = await checkoutQuoteFixture(customer);
  const pending = await f.repository.orders.prepare(
    f.context,
    f.principal,
    {
      intent: { ...checkoutIntent(), paymentMethod: 'OnlinePayment' },
      payloadHash: 'c'.repeat(64),
    },
    () => basketOperationId,
    currentBasketOwner,
  );
  await f.repository.orders.finish(f.context, f.principal, appliedOrder(), currentBasketOwner);
  const record = (await f.repository.payments.load(f.context, f.principal, currentBasketOwner))!;
  return { ...f, pending, record };
}
export function paymentDecision(
  outcome: CustomerPaymentDecision['outcome'],
): CustomerPaymentDecision {
  return {
    schemaVersion: 1,
    operationId: basketOperationId,
    orderId: appliedOrder().orderId,
    outcome,
    checkoutUrl: outcome === 'ready' ? 'https://checkout.example.test/fixture' : null,
    expiresAt: '2026-10-20T12:00:00Z',
  };
}
