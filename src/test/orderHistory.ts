import type { OrderHistoryItem } from '../api/orderHistory';
import { addressId } from './savedAddresses';
export function historyItem(index = 1, patch: Partial<OrderHistoryItem> = {}): OrderHistoryItem {
  return {
    orderId: addressId(index),
    orderNumber: 'HISTORY-' + index,
    type: 'Takeaway',
    orderDate: '2026-10-19T12:00:00Z',
    status: 'Preparing',
    paymentStatus: 'Pending',
    currency: 'CHF',
    payableTotal: 18,
    ...patch,
  };
}
export const historyPage = (
  items = [historyItem()],
  nextBefore: { orderDate: string; orderId: string } | null = null,
) => ({
  schemaVersion: 1,
  businessTimeZoneId: 'Europe/Zurich',
  items,
  nextBefore,
});
