import { canonicalUuidSchema } from '../core/identifiers';
import type { SessionController } from '../core/sessionController';
import { ApiFailure } from '../core/transport';
import { orderReceiptSchema } from './orderReceipt';
export const historyReceiptSchema = orderReceiptSchema
  .extend({ currency: orderReceiptSchema.shape.currency.nullable() })
  .strict();
export type HistoryReceipt = ReturnType<typeof historyReceiptSchema.parse>;
export async function readHistoryReceipt(
  controller: SessionController,
  userId: string,
  orderId: string,
) {
  const id = canonicalUuidSchema.parse(orderId);
  const receipt = await controller.get(
    userId,
    '/api/customer-mobile/orders/' + id + '?schemaVersion=1',
    historyReceiptSchema,
  );
  if (receipt.orderId !== id) throw new ApiFailure(200, 'contract');
  return receipt;
}
