import { customerOrderFixture, appliedOrder } from './customerOrder';
import { currentBasketOwner } from './basketOperations';
import { checkoutQuote } from './checkoutQuote';
import type { OrderReceipt } from '../api/orderReceipt';
export function receiptResponse(): OrderReceipt {
  const quote = checkoutQuote();
  return {
    schemaVersion: 1,
    orderId: appliedOrder().orderId,
    orderNumber: '20261019-001',
    type: 'Takeaway',
    orderDate: '2026-10-19T10:00:00Z',
    status: 'Preparing',
    paymentStatus: 'Pending',
    currency: 'CHF',
    businessTimeZoneId: 'Europe/Zurich',
    expectedReadyAt: '2026-10-19T10:15:00Z',
    estimatedDeliveryTime: null,
    confirmationFlow: 'direct',
    reviewDeadlineUtc: null,
    money: quote.money,
    payableTotal: 17,
    billingCreditAmount: 0,
    billChargeAmount: 0,
    totalPaid: 0,
    remainingAmount: 17,
    items: quote.items.map((item) => ({ ...item, basketItemId: null })),
  };
}
export async function savedOrderFixture(customer = false) {
  const f = await customerOrderFixture(customer);
  await f.repository.orders.finish(
    f.context,
    f.principal,
    { ...appliedOrder(), schemaVersion: 1, outcome: 'Applied' },
    currentBasketOwner,
  );
  const [decision] = await f.repository.orders.decisions(
    f.context,
    f.principal,
    currentBasketOwner,
  );
  return { ...f, decision: decision! };
}
