import { z } from 'zod';
import type { SessionController } from '../core/sessionController';
import { canonicalUuidSchema } from '../core/identifiers';
import { ApiFailure } from '../core/transport';
import { checkoutMoney } from './checkoutMoney';
import { orderReceiptSchema } from './orderReceipt';
// Keep the original UTC precision for keyset cursors; JS Date would discard microseconds.
const instant = z.iso
  .datetime()
  .refine((value) => (value.split('.')[1]?.replace('Z', '').length ?? 0) <= 7);
const cursorSchema = z.strictObject({ orderDate: instant, orderId: canonicalUuidSchema });
const itemSchema = z
  .strictObject({
    orderId: canonicalUuidSchema,
    orderNumber: orderReceiptSchema.shape.orderNumber,
    type: orderReceiptSchema.shape.type,
    orderDate: instant,
    status: orderReceiptSchema.shape.status,
    paymentStatus: orderReceiptSchema.shape.paymentStatus,
    currency: orderReceiptSchema.shape.currency.nullable(),
    payableTotal: checkoutMoney.nullable(),
  })
  .refine((item) => (item.currency === null) === (item.payableTotal === null));
export type OrderHistoryCursor = z.infer<typeof cursorSchema>;
export type OrderHistoryItem = z.infer<typeof itemSchema>;
function sortInstant(value: string) {
  return value.replace(
    /(?:\.(\d+))?Z$/,
    (_match: string, fraction: string | undefined) => '.' + (fraction ?? '').padEnd(7, '0') + 'Z',
  );
}
function follows(item: OrderHistoryCursor, cursor: OrderHistoryCursor) {
  const date = sortInstant(item.orderDate);
  const before = sortInstant(cursor.orderDate);
  return date < before || (date === before && item.orderId > cursor.orderId);
}
export const orderHistorySchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    businessTimeZoneId: orderReceiptSchema.shape.businessTimeZoneId,
    items: z.array(itemSchema).max(20),
    nextBefore: cursorSchema.nullable(),
  })
  .refine((page) => {
    if (new Set(page.items.map((item) => item.orderId)).size !== page.items.length) return false;
    if (page.items.some((item, index) => index > 0 && !follows(item, page.items[index - 1]!)))
      return false;
    if (!page.nextBefore) return true;
    const last = page.items.at(-1);
    return (
      page.items.length === 20 &&
      last?.orderId === page.nextBefore.orderId &&
      last.orderDate === page.nextBefore.orderDate
    );
  });
export async function readOrderHistory(
  controller: SessionController,
  userId: string,
  before?: OrderHistoryCursor,
) {
  const cursor = before === undefined ? undefined : cursorSchema.parse(before);
  const query = cursor
    ? '&beforeOrderDate=' +
      encodeURIComponent(cursor.orderDate) +
      '&beforeOrderId=' +
      cursor.orderId
    : '';
  const page = await controller.get(
    userId,
    '/api/customer-mobile/orders?schemaVersion=1' + query,
    orderHistorySchema,
  );
  if (cursor && page.items.some((item) => !follows(item, cursor)))
    throw new ApiFailure(200, 'contract');
  return page;
}
